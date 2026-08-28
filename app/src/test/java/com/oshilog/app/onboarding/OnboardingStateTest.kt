package com.oshilog.app.onboarding

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OnboardingStateTest {
    @Test
    fun `defaults match the prototype contract`() {
        val state = OnboardingState()

        assertEquals(OnboardingStep.Country, state.step)
        assertEquals(setOf(CountryCode.JP, CountryCode.ID), state.selectedCountries)
        assertEquals(SurfaceStyle.Outline, state.surfaceStyle)
        assertEquals("#7F6EB5", state.accentHex)
        assertTrue(state.canContinue)
    }

    @Test
    fun `at least one country must stay selected before continuing`() {
        val state = OnboardingState(selectedCountries = emptySet())

        assertFalse(state.canContinue)
    }

    @Test
    fun `next advances through all onboarding steps without skipping`() {
        val country = OnboardingState()
        val style = country.next()
        val accent = style.next()

        assertEquals(OnboardingStep.Style, style.step)
        assertEquals(OnboardingStep.Accent, accent.step)
        assertEquals(OnboardingStep.Accent, accent.next().step)
    }

    @Test
    fun `accent accepts only normalized six digit hex values`() {
        assertEquals("#E25765", normalizeAccentHex(" #e25765 "))
        assertEquals(null, normalizeAccentHex("E25765"))
        assertEquals(null, normalizeAccentHex("#123"))
    }
}

