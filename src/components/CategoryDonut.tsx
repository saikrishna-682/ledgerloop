import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  glassTooltipContentStyle,
  glassTooltipItemStyle,
  glassTooltipLabelStyle,
} from "@/lib/chartTooltip";
import { formatCents } from "@/lib/money";
import { Cell, Pie, PieChart } from "recharts";

export function CategoryDonut({
  data,
}: {
  data: Array<{ categoryId: string; name: string; color: string; cents: number }>;
}) {
  if (data.length === 0) return null;

  return (
    <ChartContainer config={{}} className="h-[160px] w-full">
      <PieChart>
        <ChartTooltip
          formatter={(value) => formatCents(Number(value))}
          contentStyle={glassTooltipContentStyle}
          itemStyle={glassTooltipItemStyle}
          labelStyle={glassTooltipLabelStyle}
        />
        <Pie
          data={data}
          dataKey="cents"
          nameKey="name"
          innerRadius={48}
          outerRadius={76}
          strokeWidth={2}
          stroke="var(--card)"
        >
          {data.map((d) => (
            <Cell key={d.categoryId} fill={d.color} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
