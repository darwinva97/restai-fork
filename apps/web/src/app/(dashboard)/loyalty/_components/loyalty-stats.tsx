"use client";

import {
  Users,
  Star,
  Gift,
  CheckCircle2,
  Wallet,
  UserCheck,
  Percent,
  Trophy,
} from "lucide-react";
import { useLoyaltyStats, useLoyaltyAnalytics } from "@/hooks/use-loyalty";
import { StatsGrid, StatCard, StatsGridSkeleton } from "@/components/stats-grid";
import { formatCurrency } from "@/lib/utils";

export function LoyaltyStats() {
  const { data: stats, isLoading } = useLoyaltyStats();
  const { data: analytics, isLoading: analyticsLoading } = useLoyaltyAnalytics();

  // "Recompensas canjeadas" must count only APPLIED redemptions (order_id IS NOT NULL).
  // The /stats endpoint counts every redemption row (including pending ones), so we
  // prefer the corrected figure from /analytics when it is available.
  const appliedRedemptions =
    analytics?.appliedRedemptions ??
    analytics?.redemptionsApplied ??
    stats?.totalRedemptions ??
    0;

  // analytics.topRewards[] — be defensive about the field name the API returns.
  const topReward = analytics?.topRewards?.[0];
  const topRewardName =
    topReward?.name ?? topReward?.reward_name ?? topReward?.rewardName ?? "-";

  // The API returns redemptionRate as a 0..1 ratio (redeeming members / earning
  // members); render it as a percentage. Guard against an already-percent value.
  const rawRate = analytics?.redemptionRate ?? 0;
  const redemptionRatePct = rawRate <= 1 ? rawRate * 100 : rawRate;

  if (isLoading) {
    return <StatsGridSkeleton count={4} />;
  }

  return (
    <div className="space-y-4">
      <StatsGrid>
        <StatCard
          title="Clientes registrados"
          value={(stats?.totalCustomers ?? 0).toLocaleString()}
          icon={Users}
          iconColor="text-blue-600 dark:text-blue-400"
          iconBg="bg-blue-100 dark:bg-blue-900/30"
        />
        <StatCard
          title="Puntos en circulacion"
          value={(stats?.totalPointsBalance ?? 0).toLocaleString()}
          icon={Star}
          iconColor="text-yellow-600 dark:text-yellow-400"
          iconBg="bg-yellow-100 dark:bg-yellow-900/30"
        />
        <StatCard
          title="Recompensas canjeadas"
          value={appliedRedemptions.toLocaleString()}
          description="canjes aplicados a pedidos"
          icon={Gift}
          iconColor="text-green-600 dark:text-green-400"
          iconBg="bg-green-100 dark:bg-green-900/30"
        />
        <StatCard
          title="Programa activo"
          value={stats?.activeProgram ? "Si" : "No"}
          icon={CheckCircle2}
          iconColor={
            stats?.activeProgram
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground"
          }
          iconBg={
            stats?.activeProgram
              ? "bg-emerald-100 dark:bg-emerald-900/30"
              : "bg-muted"
          }
        />
      </StatsGrid>

      {/* Analytics row */}
      {analyticsLoading ? (
        <StatsGridSkeleton count={4} />
      ) : (
        <StatsGrid>
          <StatCard
            title="Pasivo de puntos"
            value={formatCurrency(analytics?.pointsLiabilityCents ?? 0)}
            description="valor de puntos no canjeados"
            icon={Wallet}
            iconColor="text-rose-600 dark:text-rose-400"
            iconBg="bg-rose-100 dark:bg-rose-900/30"
          />
          <StatCard
            title="Miembros activos"
            value={(analytics?.activeMembers ?? 0).toLocaleString()}
            icon={UserCheck}
            iconColor="text-indigo-600 dark:text-indigo-400"
            iconBg="bg-indigo-100 dark:bg-indigo-900/30"
          />
          <StatCard
            title="Tasa de canje"
            value={`${redemptionRatePct.toFixed(1)}%`}
            description="miembros que canjearon"
            icon={Percent}
            iconColor="text-cyan-600 dark:text-cyan-400"
            iconBg="bg-cyan-100 dark:bg-cyan-900/30"
          />
          <StatCard
            title="Recompensa top"
            value={topRewardName}
            description={
              topReward?.redemptions != null
                ? `${Number(topReward.redemptions).toLocaleString()} canjes`
                : undefined
            }
            icon={Trophy}
            iconColor="text-amber-600 dark:text-amber-400"
            iconBg="bg-amber-100 dark:bg-amber-900/30"
          />
        </StatsGrid>
      )}
    </div>
  );
}
