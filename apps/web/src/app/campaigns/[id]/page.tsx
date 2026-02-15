"use client";

import { CharacterSelect } from "@/components/campaign/character-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import * as api from "@/lib/api-client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { userId, loading: authLoading } = useAuth();
  const router = useRouter();
  const [campaign, setCampaign] = useState<api.Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      router.replace("/login");
      return;
    }
    api
      .getCampaign(id)
      .then(setCampaign)
      .catch(() => router.replace("/campaigns"))
      .finally(() => setLoading(false));
  }, [id, userId, authLoading, router]);

  async function handleJoin() {
    setJoining(true);
    try {
      await api.joinCampaign(id);
      setJoined(true);
    } catch {
      // may already be joined — that's fine
      setJoined(true);
    } finally {
      setJoining(false);
    }
  }

  function handleEnterSession() {
    const params = selectedCharId ? `?character=${selectedCharId}` : "";
    router.push(`/campaigns/${id}/session${params}`);
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-400 border-t-transparent" />
      </div>
    );
  }

  if (!campaign) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <button
        onClick={() => router.push("/campaigns")}
        className="mb-6 text-sm text-gray-400 hover:text-gray-200"
      >
        &larr; Back to Campaigns
      </button>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-100">
              {campaign.name}
            </h1>
            <Badge variant="gold">{campaign.ruleset}</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Created {new Date(campaign.createdAt).toLocaleDateString()}
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Join campaign */}
          {!joined && (
            <Button onClick={handleJoin} disabled={joining} className="w-full">
              {joining ? "Joining..." : "Join Campaign"}
            </Button>
          )}

          {/* Character select (show after joining) */}
          {joined && (
            <>
              <CharacterSelect campaignId={id} onSelect={setSelectedCharId} />

              <Button
                onClick={handleEnterSession}
                className="w-full"
                disabled={!selectedCharId}
              >
                Enter Session
              </Button>
            </>
          )}

          {/* Shortcut: go directly if already part of campaign */}
          {!joined && (
            <div className="text-center">
              <button
                onClick={() => {
                  setJoined(true);
                }}
                className="text-sm text-gray-500 hover:text-gray-300"
              >
                Already a member? Select character
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
