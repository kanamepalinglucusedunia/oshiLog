package com.oshilog.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.oshilog.app.onboarding.OnboardingPreferences
import com.oshilog.app.onboarding.OnboardingScreen
import com.oshilog.app.ui.home.MainShell
import com.oshilog.app.ui.theme.OshiTheme

@Composable
fun OshiLogApp() {
    val context = LocalContext.current
    val preferences = remember(context) { OnboardingPreferences(context) }
    var onboardingState by remember { mutableStateOf(preferences.loadState()) }
    var onboardingComplete by remember { mutableStateOf(preferences.isComplete) }

    OshiTheme(
        accentHex = onboardingState.accentHex,
        surfaceStyle = onboardingState.surfaceStyle,
    ) {
        if (onboardingComplete) {
            MainShell()
        } else {
            OnboardingScreen(
                state = onboardingState,
                onStateChange = { onboardingState = it },
                onComplete = {
                    preferences.complete(onboardingState)
                    onboardingComplete = true
                },
            )
        }
    }
}

