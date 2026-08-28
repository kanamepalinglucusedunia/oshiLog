package com.oshilog.app.ui.theme

import android.graphics.Color as AndroidColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.oshilog.app.R
import com.oshilog.app.onboarding.SurfaceStyle

private val Nunito = FontFamily(
    Font(R.font.nunito_light, FontWeight.Light),
    Font(R.font.nunito_regular, FontWeight.Normal),
    Font(R.font.nunito_semibold, FontWeight.SemiBold),
    Font(R.font.nunito_bold, FontWeight.Bold),
)

@Immutable
data class OshiColors(
    val background: Color,
    val surface: Color,
    val mutedSurface: Color,
    val text: Color,
    val mutedText: Color,
    val border: Color,
    val accent: Color,
    val accentPressed: Color,
    val accentSurface: Color,
    val onAccent: Color,
)

data class OshiThemeValues(
    val colors: OshiColors,
    val surfaceStyle: SurfaceStyle,
)

val LocalOshiTheme = staticCompositionLocalOf {
    OshiThemeValues(
        colors = buildOshiColors("#7F6EB5"),
        surfaceStyle = SurfaceStyle.Outline,
    )
}

@Composable
fun OshiTheme(
    accentHex: String,
    surfaceStyle: SurfaceStyle,
    content: @Composable () -> Unit,
) {
    val colors = buildOshiColors(accentHex)
    val typography = androidx.compose.material3.Typography(
        displayLarge = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Light, fontSize = 48.sp, lineHeight = 56.sp),
        headlineLarge = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Normal, fontSize = 32.sp, lineHeight = 38.sp),
        headlineSmall = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Normal, fontSize = 24.sp, lineHeight = 30.sp),
        titleLarge = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Bold, fontSize = 20.sp, lineHeight = 24.sp),
        bodyLarge = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 20.sp),
        bodyMedium = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 14.sp),
        labelLarge = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Bold, fontSize = 16.sp, lineHeight = 20.sp),
        labelSmall = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Normal, fontSize = 10.sp, lineHeight = 12.sp),
    )

    androidx.compose.runtime.CompositionLocalProvider(
        LocalOshiTheme provides OshiThemeValues(colors, surfaceStyle),
    ) {
        MaterialTheme(
            colorScheme = lightColorScheme(
                primary = colors.accent,
                onPrimary = colors.onAccent,
                primaryContainer = colors.accentSurface,
                background = colors.background,
                onBackground = colors.text,
                surface = colors.surface,
                onSurface = colors.text,
                outline = colors.border,
            ),
            typography = typography,
            content = content,
        )
    }
}

private fun buildOshiColors(accentHex: String): OshiColors {
    val accent = accentHex.toComposeColor()
    val red = AndroidColor.red(accent.toArgbCompat())
    val green = AndroidColor.green(accent.toArgbCompat())
    val blue = AndroidColor.blue(accent.toArgbCompat())
    fun blendWithWhite(accentFactor: Float): Color = Color(
        red = ((red * accentFactor) + (255 * (1f - accentFactor))).toInt(),
        green = ((green * accentFactor) + (255 * (1f - accentFactor))).toInt(),
        blue = ((blue * accentFactor) + (255 * (1f - accentFactor))).toInt(),
    )
    val luminance = accent.luminanceCompat()

    return OshiColors(
        background = if (accentHex.equals("#7F6EB5", true)) Color(0xFFFCFBFD) else blendWithWhite(0.025f),
        surface = Color.White,
        mutedSurface = Color(0xFFF5F5F5),
        text = Color(0xFF1C1C1C),
        mutedText = Color(0xFF757575),
        border = Color(0xFF2E2E2E),
        accent = accent,
        accentPressed = Color((red * .85f).toInt(), (green * .85f).toInt(), (blue * .85f).toInt()),
        accentSurface = blendWithWhite(0.05f),
        onAccent = if (luminance > 0.25) Color.Black else Color.White,
    )
}

private fun String.toComposeColor(): Color = Color(AndroidColor.parseColor(this))
private fun Color.toArgbCompat(): Int = AndroidColor.argb(
    (alpha * 255).toInt(),
    (red * 255).toInt(),
    (green * 255).toInt(),
    (blue * 255).toInt(),
)

private fun Color.luminanceCompat(): Double {
    fun linear(value: Float): Double {
        val channel = value.toDouble()
        return if (channel <= 0.04045) channel / 12.92 else Math.pow((channel + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
}
