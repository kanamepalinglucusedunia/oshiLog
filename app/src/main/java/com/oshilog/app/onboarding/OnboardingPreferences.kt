package com.oshilog.app.onboarding

import android.content.Context

class OnboardingPreferences(context: Context) {
    private val preferences = context.getSharedPreferences("oshilog_native_preferences", Context.MODE_PRIVATE)

    val isComplete: Boolean
        get() = preferences.getBoolean(KEY_COMPLETE, false)

    fun loadState(): OnboardingState {
        val countries = preferences.getStringSet(KEY_COUNTRIES, null)
            ?.mapNotNull { stored -> CountryCode.entries.firstOrNull { it.name == stored } }
            ?.toSet()
            ?.takeIf { it.isNotEmpty() }
            ?: setOf(CountryCode.JP, CountryCode.ID)
        val style = preferences.getString(KEY_SURFACE_STYLE, null)
            ?.let { stored -> SurfaceStyle.entries.firstOrNull { it.name == stored } }
            ?: SurfaceStyle.Outline
        val accent = preferences.getString(KEY_ACCENT, null)
            ?.let(::normalizeAccentHex)
            ?: "#7F6EB5"

        return OnboardingState(
            selectedCountries = countries,
            surfaceStyle = style,
            accentHex = accent,
        )
    }

    fun complete(state: OnboardingState) {
        preferences.edit()
            .putBoolean(KEY_COMPLETE, true)
            .putStringSet(KEY_COUNTRIES, state.selectedCountries.map { it.name }.toSet())
            .putString(KEY_SURFACE_STYLE, state.surfaceStyle.name)
            .putString(KEY_ACCENT, state.accentHex)
            .apply()
    }

    private companion object {
        const val KEY_COMPLETE = "onboarding_complete"
        const val KEY_COUNTRIES = "active_countries"
        const val KEY_SURFACE_STYLE = "surface_style"
        const val KEY_ACCENT = "accent_hex"
    }
}

