package com.oshilog.app

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun resetToFreshInstallState() {
        composeRule.activity
            .getSharedPreferences("oshilog_native_preferences", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        composeRule.activityRule.scenario.recreate()
        composeRule.waitForIdle()
    }

    @Test
    fun freshInstallLaunchesOnboarding() {
        composeRule.onNodeWithText("oshiLog").assertIsDisplayed()
        composeRule.onNodeWithText("Where are you active?").assertIsDisplayed()
        composeRule.onNodeWithText("Continue").assertIsDisplayed()
    }
}
