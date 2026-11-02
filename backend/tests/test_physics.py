import numpy as np
import pytest

from app.physics.model import (
    AMP_LOG_SPREAD,
    SENSOR_NOISE_UM,
    Faults,
    Machine,
    extract_features,
    measure,
    overall_rms,
    predict,
    predict_for,
    spectrum,
    synthesize_signal,
    waveform_preview,
)

MACHINE = Machine(wn_rpm=3600.0, thermal=1.0)
HEALTHY = Faults()
IMBALANCE = Faults(imbalance=0.5)
MISALIGNMENT = Faults(misalignment=0.5)
FRICTION = Faults(friction=0.5)
SPEEDS = np.arange(300.0, 6001.0, 10.0)


def test_imbalance_1x_grows_with_speed_squared_well_below_critical() -> None:
    low = predict_for(IMBALANCE, MACHINE, 300.0, 0.0).amp_1x_um
    high = predict_for(IMBALANCE, MACHINE, 600.0, 0.0).amp_1x_um

    assert high / low == pytest.approx(4.0, rel=0.05)


def test_imbalance_ignores_load() -> None:
    no_load = predict_for(IMBALANCE, MACHINE, 2950.0, 0.0)
    loaded = predict_for(IMBALANCE, MACHINE, 2950.0, 2000.0)

    assert loaded.amp_1x_um == pytest.approx(no_load.amp_1x_um)
    assert loaded.amp_2x_um == pytest.approx(no_load.amp_2x_um)


def test_imbalance_1x_peaks_at_critical_speed_and_dominates() -> None:
    response = predict_for(IMBALANCE, MACHINE, SPEEDS, 0.0)

    assert SPEEDS[np.argmax(response.amp_1x_um)] == pytest.approx(3600.0, rel=0.02)
    assert np.all(response.amp_1x_um > response.amp_2x_um)


def test_misalignment_shows_strong_2x_peaking_near_half_critical() -> None:
    response = predict_for(MISALIGNMENT, MACHINE, SPEEDS, 1000.0)

    assert SPEEDS[np.argmax(response.amp_2x_um)] == pytest.approx(1800.0, rel=0.02)
    at_peak = predict_for(MISALIGNMENT, MACHINE, 1800.0, 1000.0)
    assert at_peak.amp_2x_um > 3.0 * at_peak.amp_1x_um


def test_misalignment_2x_grows_with_load() -> None:
    no_load = predict_for(MISALIGNMENT, MACHINE, 2000.0, 0.0).amp_2x_um
    loaded = predict_for(MISALIGNMENT, MACHINE, 2000.0, 2000.0).amp_2x_um

    # The residual imbalance adds a small load-independent 2x term.
    assert loaded / no_load == pytest.approx(1.0 + 2000.0 / 1500.0, rel=0.01)


def test_friction_raises_temperature_and_broadband() -> None:
    healthy = predict_for(HEALTHY, MACHINE, 3000.0, 1000.0)
    friction = predict_for(FRICTION, MACHINE, 3000.0, 1000.0)

    assert friction.temp_rise_c > 2.0 * healthy.temp_rise_c
    assert friction.broadband_um > 1.5 * healthy.broadband_um
    assert healthy.broadband_um == pytest.approx(SENSOR_NOISE_UM)


def test_friction_heat_grows_with_load() -> None:
    no_load = predict_for(FRICTION, MACHINE, 3000.0, 0.0).temp_rise_c
    loaded = predict_for(FRICTION, MACHINE, 3000.0, 2000.0).temp_rise_c

    assert loaded > 1.5 * no_load


def test_friction_lowers_the_resonance_peak() -> None:
    clean = predict_for(IMBALANCE, MACHINE, 3600.0, 0.0).amp_1x_um
    damped = predict_for(Faults(imbalance=0.5, friction=1.0), MACHINE, 3600.0, 0.0).amp_1x_um

    assert damped < 0.5 * clean


def test_healthy_machine_has_small_residual_1x() -> None:
    healthy = predict_for(HEALTHY, MACHINE, 2950.0, 500.0).amp_1x_um
    faulty = predict_for(Faults(imbalance=0.15), MACHINE, 2950.0, 500.0).amp_1x_um

    assert 0.0 < healthy < 3.0
    assert faulty > 3.0 * healthy


def test_predict_broadcasts_like_elementwise_calls() -> None:
    imbalance = np.array([0.0, 0.3, 0.8])
    wn = np.array([3300.0, 3600.0, 3900.0])
    rpm = np.array([900.0, 2950.0, 5100.0])

    batch = predict(
        imbalance=imbalance,
        misalignment=0.2,
        friction=0.1,
        wn_rpm=wn,
        thermal=1.0,
        rpm=rpm,
        load_n=1000.0,
    )

    for i in range(3):
        single = predict_for(Faults(imbalance[i], 0.2, 0.1), Machine(wn[i], 1.0), rpm[i], 1000.0)
        for got, expected in zip(batch, single, strict=True):
            assert got[i] == pytest.approx(float(expected))


def test_extract_features_recovers_clean_sinusoids() -> None:
    rpm, rate = 2950.0, 5000.0
    t = np.arange(5000) / rate
    omega = 2.0 * np.pi * rpm / 60.0
    signal = 12.0 * np.sin(omega * t + 0.4) + 3.0 * np.cos(2.0 * omega * t) + 1.0

    amp_1x, amp_2x, broadband = extract_features(signal, rpm, rate)

    assert amp_1x == pytest.approx(12.0, rel=1e-6)
    assert amp_2x == pytest.approx(3.0, rel=1e-6)
    assert broadband == pytest.approx(0.0, abs=1e-6)


def test_extract_features_measures_noise_as_broadband() -> None:
    rng = np.random.default_rng(1)
    signal = synthesize_signal(10.0, 2.0, 4.0, 3000.0, rng)

    _, _, broadband = extract_features(signal, 3000.0, 5000.0)

    assert broadband == pytest.approx(np.hypot(4.0, SENSOR_NOISE_UM), rel=0.05)


def test_extract_features_at_standstill_reports_no_harmonics() -> None:
    signal = np.random.default_rng(2).standard_normal(1000)

    assert extract_features(signal, 0.0, 5000.0)[:2] == (0.0, 0.0)


@pytest.mark.parametrize(("rpm", "duration_s"), [(6.0, 1.0), (60.0, 0.04), (100.0, 1.0)])
def test_extract_features_below_two_cycles_reports_no_harmonics(rpm, duration_s) -> None:
    rate = 5000.0
    signal = np.random.default_rng(3).normal(0.0, SENSOR_NOISE_UM, round(duration_s * rate))
    amp_1x, amp_2x, broadband = extract_features(signal, rpm, rate)
    assert (amp_1x, amp_2x) == (0.0, 0.0)
    assert broadband < 3 * SENSOR_NOISE_UM  # noise is not amplified into a huge 1x


def test_extract_features_from_two_cycles_is_well_conditioned() -> None:
    rate, rpm = 5000.0, 120.0  # exactly two cycles in one second
    t = np.arange(int(rate)) / rate
    signal = 10.0 * np.sin(2 * np.pi * rpm / 60 * t)
    assert extract_features(signal, rpm, rate)[0] == pytest.approx(10.0, rel=1e-6)


def test_measure_is_deterministic_for_a_seed() -> None:
    first = measure(IMBALANCE, MACHINE, 2950.0, 500.0, np.random.default_rng(7))
    second = measure(IMBALANCE, MACHINE, 2950.0, 500.0, np.random.default_rng(7))
    other = measure(IMBALANCE, MACHINE, 2950.0, 500.0, np.random.default_rng(8))

    assert first.features == second.features
    assert np.array_equal(first.displacement_um, second.displacement_um)
    assert first.features != other.features


def test_measured_1x_scatter_matches_the_stated_spread() -> None:
    true_1x = float(predict_for(IMBALANCE, MACHINE, 2950.0, 0.0).amp_1x_um)
    rng = np.random.default_rng(3)

    log_errors = [
        np.log(measure(IMBALANCE, MACHINE, 2950.0, 0.0, rng).features.amp_1x_um / true_1x)
        for _ in range(400)
    ]

    assert abs(np.mean(log_errors)) < 0.06
    assert np.std(log_errors) == pytest.approx(AMP_LOG_SPREAD, abs=0.05)


def test_measure_rejects_too_short_signals() -> None:
    with pytest.raises(ValueError):
        measure(HEALTHY, MACHINE, 1000.0, 0.0, np.random.default_rng(0), duration_s=0.001)


def test_overall_rms_combines_harmonics_and_broadband() -> None:
    assert float(overall_rms(4.0, 0.0, 3.0)) == pytest.approx(np.sqrt(8.0 + 9.0))


def test_spectrum_peaks_at_running_speed_and_stops_at_200_hz() -> None:
    rpm, rate = 3000.0, 5000.0
    t = np.arange(5000) / rate
    signal = 10.0 * np.sin(2.0 * np.pi * rpm / 60.0 * t)

    freq, amp = spectrum(signal, rate)

    assert freq[-1] <= 200.0
    assert freq[np.argmax(amp)] == pytest.approx(50.0)
    assert amp.max() == pytest.approx(10.0, rel=0.02)


def test_waveform_preview_is_capped_to_window_and_points() -> None:
    signal = np.arange(5000, dtype=float)

    t, x = waveform_preview(signal, 5000.0)

    assert t.size == x.size <= 400
    assert t[-1] < 0.2
    assert x[0] == 0.0
