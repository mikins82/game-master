"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Campaign } from "@/lib/api-client";
import Link from "next/link";

interface CampaignCardProps {
  campaign: Campaign;
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  return (
    <Link href={`/campaigns/${campaign.id}`}>
      <Card className="transition-colors hover:border-gold-500/40 hover:bg-surface-700">
        <CardContent className="flex items-center justify-between py-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-100">
              {campaign.name}
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              Created {new Date(campaign.createdAt).toLocaleDateString()}
            </p>
          </div>
          <Badge variant="gold">{campaign.ruleset}</Badge>
        </CardContent>
      </Card>
    </Link>
  );
}
