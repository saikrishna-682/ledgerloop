import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  glassTooltipContentStyle,
  glassTooltipItemStyle,
  glassTooltipLabelStyle,
} from "@/lib/chartTooltip";
import { formatMonthKeyShort } from "@/lib/months";
import { formatCents } from "@/lib/money";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

export function TrendChart({
  data,
}: {
  data: Array<{ monthKey: string; incomeCents: number; spentCents: number }>;
}) {
  const chartData = data.map((d) => ({ ...d, month: formatMonthKeyShort(d.monthKey) }));

  return (
    <ChartContainer
      config={{
        incomeCents: { label: "Income", color: "var(--chart-1)" },
        spentCents: { label: "Spent", color: "var(--chart-4)" },
      }}
      className="h-[160px] w-full"
    >
      <BarChart data={chartData} barGap={4}>
        <CartesianGrid vertical={false} strokeOpacity={0.4} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
        <ChartTooltip
          cursor={false}
          formatter={(value) => formatCents(Number(value))}
          contentStyle={glassTooltipContentStyle}
          itemStyle={glassTooltipItemStyle}
          labelStyle={glassTooltipLabelStyle}
        />
        <Bar dataKey="incomeCents" fill="var(--color-incomeCents)" radius={4} />
        <Bar dataKey="spentCents" fill="var(--color-spentCents)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
