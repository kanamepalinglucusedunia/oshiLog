package com.oshilog.app.onboarding

enum class OnboardingStep { Country, Style, Accent }

enum class CountryCode(val displayName: String, val flag: String) {
    JP("Japan", "🇯🇵"),
    ID("Indonesia", "🇮🇩"),
    MY("Malaysia", "🇲🇾"),
    KR("Korea", "🇰🇷"),
    TH("Thailand", "🇹🇭"),
}

enum class SurfaceStyle { Outline, SoftShadow }

data class AccentPreset(val label: String, val hex: String)

val accentPresets = listOf(
    AccentPreset("Lavender", "#7F6EB5"),
    AccentPreset("Rose", "#D65A7B"),
    AccentPreset("Sky", "#4A9BC7"),
    AccentPreset("Emerald", "#2E9E6B"),
    AccentPreset("Amber", "#C98A2D"),
    AccentPreset("Coral", "#D96C4F"),
    AccentPreset("Teal", "#2E9E9E"),
    AccentPreset("Indigo", "#5B6CC6"),
)

data class OnboardingState(
    val step: OnboardingStep = OnboardingStep.Country,
    val selectedCountries: Set<CountryCode> = setOf(CountryCode.JP, CountryCode.ID),
    val surfaceStyle: SurfaceStyle = SurfaceStyle.Outline,
    val accentHex: String = "#7F6EB5",
) {
    val canContinue: Boolean
        get() = step != OnboardingStep.Country || selectedCountries.isNotEmpty()

    fun toggleCountry(country: CountryCode): OnboardingState = copy(
        selectedCountries = selectedCountries.toMutableSet().apply {
            if (!add(country)) remove(country)
        },
    )

    fun selectStep(target: OnboardingStep): OnboardingState = copy(step = target)

    fun next(): OnboardingState = copy(
        step = when (step) {
            OnboardingStep.Country -> if (canContinue) OnboardingStep.Style else OnboardingStep.Country
            OnboardingStep.Style -> OnboardingStep.Accent
            OnboardingStep.Accent -> OnboardingStep.Accent
        },
    )
}

fun normalizeAccentHex(value: String): String? {
    val normalized = value.trim().uppercase()
    return normalized.takeIf { it.matches(Regex("^#[0-9A-F]{6}$")) }
}

