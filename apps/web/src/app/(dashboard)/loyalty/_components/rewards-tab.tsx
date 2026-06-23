"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
} from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import { Plus, Gift, Award, Pencil, Trash2, Package, User, CalendarClock } from "lucide-react";
import { useLoyaltyRewards, useLoyaltyPrograms, useDeleteReward } from "@/hooks/use-loyalty";
import { formatCurrency } from "@/lib/utils";
import { RewardDialog } from "./reward-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

function formatDate(value: any): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

// A reward is "available" now if active, has stock (or unlimited), and within its date window.
function getAvailability(reward: any): { available: boolean; reason: string } {
  if (!reward.is_active) return { available: false, reason: "Inactiva" };
  if (reward.stock_remaining != null && reward.stock_remaining <= 0) {
    return { available: false, reason: "Agotada" };
  }
  const now = Date.now();
  if (reward.starts_at && new Date(reward.starts_at).getTime() > now) {
    return { available: false, reason: "Proximamente" };
  }
  if (reward.expires_at && new Date(reward.expires_at).getTime() < now) {
    return { available: false, reason: "Vencida" };
  }
  return { available: true, reason: "Disponible" };
}

export function RewardsTab() {
  const { data: rewards, isLoading: rewardsLoading } = useLoyaltyRewards();
  const { data: programs } = useLoyaltyPrograms();
  const deleteReward = useDeleteReward();
  const [showDialog, setShowDialog] = useState(false);
  const [editingReward, setEditingReward] = useState<any>(null);
  const [deletingRewardId, setDeletingRewardId] = useState<string | null>(null);

  const rewardsList: any[] = rewards ?? [];
  const programsList: any[] = programs ?? [];
  const programId = programsList[0]?.id;

  function handleEdit(reward: any) {
    setEditingReward(reward);
    setShowDialog(true);
  }

  function handleCreate() {
    setEditingReward(null);
    setShowDialog(true);
  }

  function handleDelete() {
    if (!deletingRewardId) return;
    deleteReward.mutate(deletingRewardId, {
      onSuccess: () => {
        setDeletingRewardId(null);
        toast.success("Recompensa eliminada");
      },
      onError: (err) => toast.error(`Error: ${(err as Error).message}`),
    });
  }

  if (rewardsLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="h-5 w-32 mb-3" />
              <Skeleton className="h-4 w-48 mb-4" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleCreate} disabled={!programId}>
          <Plus className="h-4 w-4 mr-2" />Crear Recompensa
        </Button>
      </div>

      {!programId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Award className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Debes crear un programa de fidelizacion primero</p>
          </CardContent>
        </Card>
      )}

      {rewardsList.length === 0 && programId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Gift className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-1">No hay recompensas creadas</p>
            <p className="text-xs text-muted-foreground">Crea recompensas para que tus clientes canjeen sus puntos</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rewardsList.map((reward: any) => {
          const isFreeItem = reward.reward_type === "free_item";
          const availability = getAvailability(reward);
          const startsLabel = formatDate(reward.starts_at);
          const expiresLabel = formatDate(reward.expires_at);
          return (
            <Card key={reward.id} className="relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1.5 rounded-bl-lg">
                <p className="text-sm font-bold">{reward.points_cost.toLocaleString()} pts</p>
              </div>
              <CardContent className="p-5 pt-4">
                <div className="pr-20">
                  <p className="font-semibold text-foreground">{reward.name}</p>
                  {reward.description && <p className="text-xs text-muted-foreground mt-1">{reward.description}</p>}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {isFreeItem ? (
                    <Badge variant="secondary" className="text-xs">Producto gratis</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      {reward.discount_type === "percentage" ? `${reward.discount_value}% descuento` : `${formatCurrency(reward.discount_value)} descuento`}
                    </Badge>
                  )}
                  {availability.available ? (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-300 dark:text-green-400 dark:border-green-700">Disponible</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-red-600 border-red-300 dark:text-red-400 dark:border-red-700">{availability.reason}</Badge>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs gap-1 font-normal">
                    <Package className="h-3 w-3" />
                    {reward.stock_remaining != null ? `${reward.stock_remaining.toLocaleString()} en stock` : "Stock ilimitado"}
                  </Badge>
                  <Badge variant="outline" className="text-xs gap-1 font-normal">
                    <User className="h-3 w-3" />
                    {reward.max_per_customer != null ? `Max ${reward.max_per_customer}/cliente` : "Sin limite/cliente"}
                  </Badge>
                  {(startsLabel || expiresLabel) && (
                    <Badge variant="outline" className="text-xs gap-1 font-normal">
                      <CalendarClock className="h-3 w-3" />
                      {startsLabel && expiresLabel
                        ? `${startsLabel} - ${expiresLabel}`
                        : startsLabel
                          ? `Desde ${startsLabel}`
                          : `Hasta ${expiresLabel}`}
                    </Badge>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(reward)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />Editar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDeletingRewardId(reward.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {programId && (
        <RewardDialog
          open={showDialog}
          onOpenChange={setShowDialog}
          programId={programId}
          editData={editingReward}
        />
      )}

      <ConfirmDialog
        open={!!deletingRewardId}
        onOpenChange={(open) => { if (!open) setDeletingRewardId(null); }}
        title="Eliminar recompensa"
        description="Si la recompensa tiene canjes, se desactivara en vez de eliminarse."
        onConfirm={handleDelete}
        confirmLabel="Eliminar"
        variant="destructive"
      />
    </div>
  );
}
