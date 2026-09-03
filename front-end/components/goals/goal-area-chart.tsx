import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { LineChart, type LineChartSeries } from 'react-native-chart-kit/v2';
import { ThemedText } from '@/components/base/themed-text';
import {
  buildInsightsChartTheme,
  formatIntegerYLabel,
  INSIGHTS_AREA_FILL_OPACITY,
  INSIGHTS_CHART_HEIGHT,
} from '@/components/insights/insights-chart-kit-config';
import {
  GOAL_ABOVE_THRESHOLD_COLOR,
  GOAL_BELOW_THRESHOLD_COLOR,
} from '@/lib/goals/goal-colors';
import { formatWeekLabel } from '@/utils/date';

export interface GoalWeeklyPoint {
  weekStart: string;
  count: number;
}

interface GoalAreaChartProps {
  /** Applicable weeks only (>= the activity's first completion week). */
  data: GoalWeeklyPoint[];
  targetPerWeek: number;
}

const Y_AXIS_MAX_VALUE = 7;

type GoalAreaRow = {
  week: string;
  count: number;
};

/**
 * 8-week threshold area chart.
 */
export default function GoalAreaChart({
  data,
  targetPerWeek,
}: GoalAreaChartProps) {
  const [chartWidth, setChartWidth] = useState(0);

  const rows = useMemo<GoalAreaRow[]>(
    () =>
      data.map((point) => ({
        week: formatWeekLabel(point.weekStart),
        count: point.count,
      })),
    [data],
  );

  const series = useMemo<LineChartSeries<GoalAreaRow>[]>(
    () => [
      {
        yKey: 'count',
        strokeWidth: 2,
        area: true,
        dot:
          data.length === 1
            ? {
                visible: true,
                stroke:
                  data[0].count >= targetPerWeek
                    ? GOAL_ABOVE_THRESHOLD_COLOR
                    : GOAL_BELOW_THRESHOLD_COLOR,
                fill:
                  data[0].count >= targetPerWeek
                    ? GOAL_ABOVE_THRESHOLD_COLOR
                    : GOAL_BELOW_THRESHOLD_COLOR,
              }
            : false,
        threshold: {
          y: targetPerWeek,
          aboveColor: GOAL_ABOVE_THRESHOLD_COLOR,
          belowColor: GOAL_BELOW_THRESHOLD_COLOR,
        },
      },
    ],
    [targetPerWeek, data],
  );

  const referenceLines = useMemo(
    () => [
      {
        y: targetPerWeek,
        color: 'rgba(255,255,255,0.4)',
        strokeDasharray: [6, 5],
        strokeWidth: 1.5,
      },
    ],
    [targetPerWeek],
  );

  const theme = useMemo(
    () => ({
      ...buildInsightsChartTheme(),
      series: [GOAL_ABOVE_THRESHOLD_COLOR],
    }),
    [],
  );

  function handleLayout(event: LayoutChangeEvent) {
    setChartWidth(event.nativeEvent.layout.width);
  }

  if (data.length === 0) {
    return (
      <View style={styles.emptyState}>
        <ThemedText size="small" style={styles.emptyText}>
          No completion history yet. Complete this activity to see weekly
          performance here.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.wrapper} onLayout={handleLayout}>
      {chartWidth > 0 ? (
        <LineChart
          data={rows}
          xKey="week"
          series={series}
          width={chartWidth}
          height={INSIGHTS_CHART_HEIGHT}
          theme={theme}
          curve="linear"
          yDomain={{ min: 0, max: Y_AXIS_MAX_VALUE }}
          areaFill={{
            fromOpacity: INSIGHTS_AREA_FILL_OPACITY,
            toOpacity: 0,
          }}
          showHorizontalGridLines
          formatYLabel={formatIntegerYLabel}
          labelStrategy="show"
          referenceLines={referenceLines}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    overflow: 'hidden',
  },
  emptyState: {
    minHeight: INSIGHTS_CHART_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  emptyText: {
    opacity: 0.65,
    textAlign: 'center',
    lineHeight: 18,
  },
});
