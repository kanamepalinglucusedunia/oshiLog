package com.oshilog.app.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oshilog.app.ui.components.OshiButton
import com.oshilog.app.ui.components.OshiCard
import com.oshilog.app.ui.components.OshiHeart
import com.oshilog.app.ui.theme.LocalOshiTheme

@Composable
fun OnboardingScreen(
    state: OnboardingState,
    onStateChange: (OnboardingState) -> Unit,
    onComplete: () -> Unit,
) {
    val colors = LocalOshiTheme.current.colors
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .navigationBarsPadding()
            .padding(horizontal = 16.dp),
    ) {
        LogoHeader()
        StepDots(
            selected = state.step,
            onSelect = { onStateChange(state.selectStep(it)) },
        )
        when (state.step) {
            OnboardingStep.Country -> CountryStep(state, onStateChange)
            OnboardingStep.Style -> StyleStep(state, onStateChange)
            OnboardingStep.Accent -> AccentStep(state, onStateChange, onComplete)
        }
        Spacer(Modifier.height(48.dp))
    }
}

@Composable
private fun LogoHeader() {
    val colors = LocalOshiTheme.current.colors
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 32.dp, bottom = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .background(colors.accentSurface, CircleShape)
                .border(2.dp, colors.accent, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            OshiHeart(modifier = Modifier.size(32.dp), color = colors.accent)
        }
        Spacer(Modifier.height(12.dp))
        Text("oshiLog", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        Text(
            "Your personal oshikatsu journal",
            style = MaterialTheme.typography.bodyMedium,
            color = colors.mutedText,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun StepDots(selected: OnboardingStep, onSelect: (OnboardingStep) -> Unit) {
    val colors = LocalOshiTheme.current.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
    ) {
        OnboardingStep.entries.forEach { step ->
            Box(
                modifier = Modifier
                    .size(18.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button) { onSelect(step) }
                    .padding(4.dp)
                    .background(if (step == selected) colors.accent else colors.surface, CircleShape)
                    .border(2.dp, colors.accent, CircleShape)
                    .semantics { contentDescription = "Onboarding step ${step.name}" },
            )
        }
    }
}

@Composable
private fun CountryStep(state: OnboardingState, onStateChange: (OnboardingState) -> Unit) {
    StepTitle(
        title = "Where are you active?",
        subtitle = "Pick at least one country. Japan and Indonesia are pre-selected — confirm or change them.",
    )
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CountryCode.entries.forEach { country ->
            ChoiceChip(
                label = "${country.flag}  ${country.displayName}",
                selected = country in state.selectedCountries,
                onClick = { onStateChange(state.toggleCountry(country)) },
            )
        }
    }
    OshiButton(
        label = "Continue",
        enabled = state.canContinue,
        onClick = { onStateChange(state.next()) },
        modifier = Modifier.padding(top = 24.dp),
    )
}

@Composable
private fun StyleStep(state: OnboardingState, onStateChange: (OnboardingState) -> Unit) {
    StepTitle(
        title = "Pick your surface style",
        subtitle = "Outline keeps crisp borders; Soft Shadow is calmer.",
    )
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SurfaceStyle.entries.forEach { style ->
            val selected = style == state.surfaceStyle
            OshiCard(
                modifier = Modifier
                    .weight(1f)
                    .clickable(role = Role.Button) { onStateChange(state.copy(surfaceStyle = style)) },
                accent = selected,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(72.dp)
                            .background(Color.White, RoundedCornerShape(12.dp))
                            .border(1.dp, LocalOshiTheme.current.colors.border, RoundedCornerShape(12.dp)),
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        if (style == SurfaceStyle.Outline) "Outline" else "Soft Shadow",
                        color = if (selected) LocalOshiTheme.current.colors.accent else LocalOshiTheme.current.colors.text,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
                    )
                }
            }
        }
    }
    OshiButton(
        label = "Continue",
        onClick = { onStateChange(state.next()) },
        modifier = Modifier.padding(top = 24.dp),
    )
}

@Composable
private fun AccentStep(
    state: OnboardingState,
    onStateChange: (OnboardingState) -> Unit,
    onComplete: () -> Unit,
) {
    var hexInput by remember(state.accentHex) { mutableStateOf(state.accentHex) }
    val normalizedHex = normalizeAccentHex(hexInput)
    StepTitle(
        title = "Pick your accent color",
        subtitle = "Lavender is the default. Contrast is auto-adjusted for accessibility.",
    )
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        accentPresets.forEach { preset ->
            val selected = state.accentHex.equals(preset.hex, ignoreCase = true)
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .background(Color(android.graphics.Color.parseColor(preset.hex)), CircleShape)
                    .then(if (selected) Modifier.border(3.dp, LocalOshiTheme.current.colors.border, CircleShape) else Modifier)
                    .clickable(role = Role.Button) {
                        hexInput = preset.hex
                        onStateChange(state.copy(accentHex = preset.hex))
                    }
                    .semantics { contentDescription = preset.label },
            )
        }
    }
    OutlinedTextField(
        value = hexInput,
        onValueChange = { input ->
            hexInput = input
            normalizeAccentHex(input)?.let { onStateChange(state.copy(accentHex = it)) }
        },
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 20.dp, bottom = 8.dp),
        label = { Text("Custom color (HEX)") },
        placeholder = { Text("#7F6EB5") },
        singleLine = true,
        isError = hexInput.isNotBlank() && normalizedHex == null,
        supportingText = if (hexInput.isNotBlank() && normalizedHex == null) {
            { Text("Enter a 6-digit hex like #7F6EB5") }
        } else null,
    )
    OshiCard(modifier = Modifier.fillMaxWidth(), accent = true) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Preview", color = LocalOshiTheme.current.colors.accent, fontWeight = FontWeight.Bold)
            Box(
                modifier = Modifier
                    .padding(top = 8.dp)
                    .background(LocalOshiTheme.current.colors.accent, RoundedCornerShape(16.dp))
                    .padding(horizontal = 20.dp, vertical = 10.dp),
            ) {
                Text(
                    "Your journal awaits",
                    color = LocalOshiTheme.current.colors.onAccent,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
    OshiButton(
        label = "Start journaling",
        onClick = onComplete,
        modifier = Modifier.padding(top = 24.dp),
    )
}

@Composable
private fun StepTitle(title: String, subtitle: String) {
    val colors = LocalOshiTheme.current.colors
    Text(
        text = title,
        modifier = Modifier.fillMaxWidth(),
        style = MaterialTheme.typography.titleLarge,
        textAlign = TextAlign.Center,
    )
    Text(
        text = subtitle,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp, bottom = 16.dp),
        style = MaterialTheme.typography.bodyMedium,
        color = colors.mutedText,
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun ChoiceChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val colors = LocalOshiTheme.current.colors
    Text(
        text = label,
        modifier = Modifier
            .background(if (selected) colors.accentSurface else colors.surface, RoundedCornerShape(24.dp))
            .border(1.dp, if (selected) colors.accent else colors.border, RoundedCornerShape(24.dp))
            .clickable(role = Role.Checkbox, onClick = onClick)
            .padding(PaddingValues(horizontal = 14.dp, vertical = 9.dp)),
        color = if (selected) colors.accent else colors.text,
        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
    )
}
