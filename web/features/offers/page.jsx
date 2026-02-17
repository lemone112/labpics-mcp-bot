"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Toast } from "@/components/ui/toast";
import { StatusChip } from "@/components/ui/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";

export default function OffersFeaturePage() {
  const { loading, session } = useAuthGuard();
  const [offers, setOffers] = useState([]);
  const [outbound, setOutbound] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ type: "info", message: "" });
  const [form, setForm] = useState({ title: "", subtotal: "12000", discount_pct: "0" });

  const load = useCallback(async () => {
    if (!session?.active_project_id) return;
    setBusy(true);
    try {
      const [offersResp, outboundResp] = await Promise.all([apiFetch("/offers"), apiFetch("/outbound")]);
      setOffers(Array.isArray(offersResp?.offers) ? offersResp.offers : []);
      setOutbound(Array.isArray(outboundResp?.outbound) ? outboundResp.outbound : []);
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to load offers/outbox" });
    } finally {
      setBusy(false);
    }
  }, [session?.active_project_id]);

  useEffect(() => {
    if (!loading && session?.authenticated && session?.active_project_id) {
      load();
    }
  }, [loading, session, load]);

  async function createOffer() {
    if (!form.title.trim()) return;
    try {
      await apiFetch("/offers", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          subtotal: Number(form.subtotal || 0),
          discount_pct: Number(form.discount_pct || 0),
        }),
      });
      setForm({ title: "", subtotal: "12000", discount_pct: "0" });
      setToast({ type: "success", message: "Offer created" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to create offer" });
    }
  }

  async function approveDiscount(id) {
    try {
      await apiFetch(`/offers/${id}/approve-discount`, { method: "POST", body: JSON.stringify({}) });
      setToast({ type: "success", message: "Discount approved" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to approve discount" });
    }
  }

  async function approveAndSend(id) {
    try {
      await apiFetch(`/offers/${id}/approve-send`, { method: "POST", body: JSON.stringify({}) });
      setToast({ type: "success", message: "Offer marked as sent" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to approve send" });
    }
  }

  async function createOutboundDraft() {
    try {
      await apiFetch("/outbound/draft", {
        method: "POST",
        body: JSON.stringify({
          channel: "email",
          recipient_ref: "client@example.com",
          body_text: "Prepared updated offer and next steps for your review.",
          idempotency_key: `offer-draft-${Date.now()}`,
        }),
      });
      setToast({ type: "success", message: "Outbound draft created" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to create outbound draft" });
    }
  }

  async function approveOutbound(id) {
    try {
      await apiFetch(`/outbound/${id}/approve`, { method: "POST", body: JSON.stringify({}) });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Outbound approve failed" });
    }
  }

  async function sendOutbound(id) {
    try {
      await apiFetch(`/outbound/${id}/send`, { method: "POST", body: JSON.stringify({}) });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Outbound send failed" });
    }
  }

  if (loading || !session) {
    return <div className="p-8 text-sm">Loading...</div>;
  }

  if (!session.active_project_id) {
    return (
      <PageShell title="Offers" subtitle="Offer builder + outbound approval pipeline">
        <Card data-motion-item>
          <CardContent>
            <EmptyState
              title="Select active project first"
              description="Offers and outbound policies are scoped to active project/account."
              actions={
                <Link href="/projects">
                  <Button>Go to Projects</Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell title="Offers + Outbox" subtitle="Draft→approve→send lifecycle with idempotency and rate-limit policies">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Create offer</CardTitle>
            <Button variant="outline" size="sm" onClick={load} disabled={busy}>
              {busy ? "Refreshing..." : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <Input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Offer title"
            />
            <Input
              type="number"
              value={form.subtotal}
              onChange={(event) => setForm((prev) => ({ ...prev, subtotal: event.target.value }))}
              placeholder="Subtotal"
            />
            <Input
              type="number"
              value={form.discount_pct}
              onChange={(event) => setForm((prev) => ({ ...prev, discount_pct: event.target.value }))}
              placeholder="Discount %"
            />
            <Button onClick={createOffer}>Create</Button>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Offers</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Offers table">
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>${Number(row.total || 0).toLocaleString()}</TableCell>
                    <TableCell>{Number(row.discount_pct || 0)}%</TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => approveDiscount(row.id)}>
                          Approve discount
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => approveAndSend(row.id)}>
                          Approve send
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!offers.length ? (
                  <TableRow>
                    <TableCell colSpan={5}>No offers yet.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Outbox approval queue</CardTitle>
            <Button variant="secondary" size="sm" onClick={createOutboundDraft}>
              New outbound draft
            </Button>
          </CardHeader>
          <CardContent>
            <Table aria-label="Outbox queue">
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outbound.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.recipient_ref || "-"}</TableCell>
                    <TableCell>{row.channel}</TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => approveOutbound(row.id)}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => sendOutbound(row.id)}>
                          Send
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!outbound.length ? (
                  <TableRow>
                    <TableCell colSpan={4}>No outbound messages yet.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Toast type={toast.type} message={toast.message} />
      </div>
    </PageShell>
  );
}
