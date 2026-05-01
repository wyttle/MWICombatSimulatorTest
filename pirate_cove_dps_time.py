import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

# ── Constants ──
C = 2_312_640  # avg total damage per dungeon run (derived from 1752 DPS → 22min)
USER_DPS = 1752
USER_TIME = 22.0  # minutes

dps_range = np.linspace(1200, 2700, 500)
time_min = C / (dps_range * 60)

ref_dps = np.array([1300, 1400, 1500, 1600, 1752, 1900, 2000, 2100, 2200, 2400, 2600])
ref_time = C / (ref_dps * 60)

# ── Plot ──
fig, ax = plt.subplots(figsize=(12, 7), dpi=150)
fig.patch.set_facecolor('#1a1a2e')
ax.set_facecolor('#16213e')

# Main curve
ax.plot(dps_range, time_min, color='#00d4ff', linewidth=2.5, label='time = 38,544 / teamDPS', zorder=3)

# Scatter reference points
ax.scatter(ref_dps, ref_time, color='#e94560', s=50, zorder=5, edgecolors='white', linewidths=0.8)

# Highlight user's data point
ax.scatter([USER_DPS], [USER_TIME], color='#ffcc00', s=180, zorder=6,
           edgecolors='white', linewidths=2, marker='*')
ax.annotate(f'Your setup\n{USER_DPS} DPS → {USER_TIME:.1f} min',
            xy=(USER_DPS, USER_TIME),
            xytext=(USER_DPS + 300, USER_TIME + 3),
            fontsize=10, color='#ffcc00', fontweight='bold',
            arrowprops=dict(arrowstyle='->', color='#ffcc00', lw=1.5),
            bbox=dict(boxstyle='round,pad=0.4', facecolor='#1a1a2e', edgecolor='#ffcc00', alpha=0.9))

for y_val in [15, 17.5, 20, 22.5, 25, 27.5, 30]:
    ax.axhline(y=y_val, color='#444466', linestyle='--', linewidth=0.6, alpha=0.4)
    ax.text(2650, y_val + 0.2, f'{y_val:.0f} min' if y_val == int(y_val) else '', fontsize=7.5, color='#666688', ha='right')

# Styling
ax.set_xlabel('Team DPS', fontsize=13, color='white', fontweight='bold', labelpad=10)
ax.set_ylabel('Average Dungeon Time (minutes)', fontsize=13, color='white', fontweight='bold', labelpad=10)
ax.set_title('Pirate Cove T1 — Team DPS vs Clear Time\n(0 deaths, inverse relationship: time = C / teamDPS)',
             fontsize=15, color='white', fontweight='bold', pad=15)

ax.set_xlim(1200, 2700)
ax.set_ylim(14, 31)
ax.tick_params(colors='#cccccc', labelsize=10)
ax.spines['bottom'].set_color('#444466')
ax.spines['left'].set_color('#444466')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.grid(True, alpha=0.15, color='#888888')

ax.legend(fontsize=11, loc='upper right', facecolor='#1a1a2e', edgecolor='#444466',
          labelcolor='white', framealpha=0.9)

# Data table in bottom-right
table_text = "  DPS  │ Time (min)\n" + "───────┼───────────\n"
for d, t in zip(ref_dps, ref_time):
    marker = " ◀" if d == USER_DPS else ""
    table_text += f"  {int(d):>4} │  {t:>5.1f}{marker}\n"

ax.text(0.98, 0.02, table_text, transform=ax.transAxes, fontsize=8.5,
        fontfamily='monospace', color='#cccccc', verticalalignment='bottom',
        horizontalalignment='right',
        bbox=dict(boxstyle='round,pad=0.5', facecolor='#0f0f23', edgecolor='#444466', alpha=0.92))

plt.tight_layout()
output_path = '/mnt/d/github/milkywayidle/MWICombatSimulatorTest/wyttle/pirate_cove_dps_time.png'
plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor())
print(f"Saved to: {output_path}")
plt.close()
