package com.oshilog.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oshilog.app.ui.components.OshiCard
import com.oshilog.app.ui.components.OshiHeart
import com.oshilog.app.ui.theme.LocalOshiTheme

private val tabs = listOf("Home", "Idol", "Event", "Venue", "Trip")

@Composable
fun MainShell() {
    val colors = LocalOshiTheme.current.colors
    var selectedTab by remember { mutableStateOf(tabs.first()) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 16.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 24.dp, bottom = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text("oshiLog", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                Text(selectedTab, color = colors.mutedText, style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.weight(1f))
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(colors.surface, CircleShape)
                    .border(1.dp, colors.border, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text("⚙", fontSize = 18.sp)
            }
        }

        OshiCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                OshiHeart(modifier = Modifier.size(36.dp), color = colors.accent)
                Text(
                    "Your $selectedTab journal is ready",
                    style = MaterialTheme.typography.titleLarge,
                    textAlign = TextAlign.Center,
                )
                Text(
                    "Fresh native workspace — data features arrive in the next milestones.",
                    modifier = Modifier.padding(top = 8.dp),
                    color = colors.mutedText,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                )
            }
        }
        Spacer(Modifier.weight(1f))
        Box(
            modifier = Modifier
                .align(Alignment.End)
                .padding(bottom = 8.dp)
                .size(52.dp)
                .background(colors.accent, CircleShape)
                .clickable(role = Role.Button) { },
            contentAlignment = Alignment.Center,
        ) {
            Text("+", color = colors.onAccent, fontSize = 30.sp)
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp)
                .background(colors.surface, RoundedCornerShape(32.dp))
                .border(1.dp, colors.border, RoundedCornerShape(32.dp))
                .padding(4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            tabs.forEach { tab ->
                val selected = tab == selectedTab
                Text(
                    text = tab,
                    modifier = Modifier
                        .weight(1f)
                        .background(if (selected) colors.accentSurface else colors.surface, RoundedCornerShape(24.dp))
                        .then(if (selected) Modifier.border(1.dp, colors.accent, RoundedCornerShape(24.dp)) else Modifier)
                        .clickable(role = Role.Tab) { selectedTab = tab }
                        .padding(vertical = 10.dp),
                    color = if (selected) colors.accent else colors.text,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}
