"use client";

import { CampaignCard } from "@/components/campaign/campaign-card";
import { CreateCampaignDialog } from "@/components/campaign/create-campaign-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import * as api from "@/lib/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function CampaignsPage() {
  const { userId, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<api.Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      router.replace("/login");
      return;
    }
    api
      .listCampaigns()
      .then(setCampaigns)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, authLoading, router]);

  if (authLoading || !userId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-100">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-400">
            Choose a campaign or create a new adventure
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setShowCreate(true)}>New Campaign</Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign Out
          </Button>
        </div>
      </div>

      {/* Campaign list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-400 border-t-transparent" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-500 px-8 py-16 text-center">
          <p className="text-lg text-gray-400">No campaigns yet</p>
          <p className="mt-2 text-sm text-gray-500">
            Create your first campaign to begin
          </p>
          <Button className="mt-6" onClick={() => setShowCreate(true)}>
            Create Campaign
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <CreateCampaignDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(c) => setCampaigns((prev) => [c, ...prev])}
      />
    </div>
  );
}
