"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import * as api from "@/lib/api-client";
import type { FormEvent } from "react";
import { useState } from "react";

interface CreateCampaignDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (campaign: api.Campaign) => void;
}

const RULESETS = ["5e", "3.5", "pf2e"] as const;

export function CreateCampaignDialog({
  open,
  onClose,
  onCreated,
}: CreateCampaignDialogProps) {
  const [name, setName] = useState("");
  const [ruleset, setRuleset] = useState<string>("5e");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const campaign = await api.createCampaign(name, ruleset);
      onCreated(campaign);
      setName("");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create campaign",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h2 className="text-xl font-bold text-gray-100">New Campaign</h2>
          <p className="text-sm text-gray-400">
            Set up a new adventure for your party
          </p>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <Input
              id="name"
              label="Campaign Name"
              placeholder="Lost Mines of Phandelver"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-300">
                Ruleset
              </label>
              <div className="flex gap-2">
                {RULESETS.map((rs) => (
                  <button
                    key={rs}
                    type="button"
                    onClick={() => setRuleset(rs)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      ruleset === rs
                        ? "border-gold-500 bg-gold-500/20 text-gold-400"
                        : "border-surface-600 bg-surface-700 text-gray-400 hover:border-surface-500"
                    }`}
                  >
                    {rs.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>

          <CardFooter className="gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? "Creating..." : "Create Campaign"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
