package com.oshilog.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.oshilog.app.onboarding.SurfaceStyle
import com.oshilog.app.ui.theme.LocalOshiTheme

@Composable
fun OshiCard(
    modifier: Modifier = Modifier,
    accent: Boolean = false,
    content: @Composable () -> Unit,
) {
    val theme = LocalOshiTheme.current
    val borderColor = if (accent) theme.colors.accent else theme.colors.border
    val shadow = if (theme.surfaceStyle == SurfaceStyle.SoftShadow) 3.dp else 0.dp
    Box(
        modifier = modifier
            .shadow(shadow, RoundedCornerShape(16.dp))
            .background(theme.colors.surface, RoundedCornerShape(16.dp))
            .border(BorderStroke(1.dp, borderColor), RoundedCornerShape(16.dp))
            .padding(16.dp),
    ) {
        content()
    }
}

@Composable
fun OshiButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = LocalOshiTheme.current.colors
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(
                if (enabled) colors.accent else colors.mutedSurface,
                RoundedCornerShape(16.dp),
            )
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(PaddingValues(horizontal = 20.dp, vertical = 14.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (enabled) colors.onAccent else colors.mutedText,
            style = androidx.compose.material3.MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
fun OshiHeart(
    modifier: Modifier = Modifier,
    color: Color = LocalOshiTheme.current.colors.accent,
) {
    Canvas(modifier = modifier) {
        drawHeart(color)
    }
}

private fun DrawScope.drawHeart(color: Color) {
    val w = size.width
    val h = size.height
    val path = Path().apply {
        moveTo(w * 0.5f, h * 0.9f)
        cubicTo(w * 0.42f, h * 0.82f, w * 0.08f, h * 0.58f, w * 0.08f, h * 0.31f)
        cubicTo(w * 0.08f, h * 0.12f, w * 0.22f, h * 0.04f, w * 0.36f, h * 0.04f)
        cubicTo(w * 0.44f, h * 0.04f, w * 0.49f, h * 0.09f, w * 0.5f, h * 0.14f)
        cubicTo(w * 0.54f, h * 0.08f, w * 0.61f, h * 0.04f, w * 0.69f, h * 0.04f)
        cubicTo(w * 0.86f, h * 0.04f, w * 0.94f, h * 0.17f, w * 0.92f, h * 0.34f)
        cubicTo(w * 0.89f, h * 0.59f, w * 0.59f, h * 0.82f, w * 0.5f, h * 0.9f)
        close()
    }
    drawPath(path, color)
}
