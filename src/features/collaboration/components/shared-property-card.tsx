"use client";

import { Building2, MapPin, Clock } from "lucide-react";
import { ContactForm } from "./contact-form";

interface SharedPropertyCardProps {
  property: {
    id: string;
    title: string;
    city: string;
    district: string | null;
    community_name: string | null;
    rental_type: string;
    monthly_rent: number | null;
    bedrooms: number | null;
    living_rooms: number | null;
    bathrooms: number | null;
    area_sqm: number | null;
    status: string;
    tags: string[] | null;
    shared_at: string | null;
    shared_expires_at: string | null;
    commission_split: string | null;
    workspace_id: string;
  };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

export function SharedPropertyCard({ property: p }: SharedPropertyCardProps) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden hover:shadow-md transition-shadow">
      {/* Cover image placeholder */}
      <div className="aspect-[4/3] bg-muted flex items-center justify-center relative">
        <Building2 className="h-12 w-12 text-muted-foreground/40" />
      </div>

      <div className="p-4 space-y-2">
        {/* Title */}
        <h3 className="font-semibold text-sm line-clamp-1">{p.title}</h3>

        {/* Location */}
        {(p.district || p.community_name) ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="line-clamp-1">{[p.city, p.district, p.community_name].filter(Boolean).join(" · ")}</span>
          </p>
        ) : null}

        {/* Price */}
        <div className="flex items-center justify-between">
          {p.monthly_rent ? (
            <span className="text-base font-bold text-primary tabular-nums">
              ¥{p.monthly_rent.toLocaleString()}
              <span className="text-xs font-normal text-muted-foreground">/月</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">价格面议</span>
          )}
        </div>

        {/* Specs */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          {p.bedrooms != null && <span>{p.bedrooms}室{p.living_rooms ?? 0}厅{p.bathrooms ?? 0}卫</span>}
          {p.area_sqm != null && <span>{p.area_sqm}㎡</span>}
          <span>{p.rental_type === "whole_unit" ? "整租" : "合租"}</span>
        </div>

        {/* Tags */}
        {p.tags && p.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {p.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Sharing meta */}
        {(p.shared_at || p.shared_expires_at || p.commission_split) && (
          <div className="border-t pt-2 mt-2 space-y-1">
            {p.shared_expires_at && (
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                有效期至: {formatDate(p.shared_expires_at)}
              </p>
            )}
            {p.commission_split && (
              <p className="text-[10px] text-muted-foreground">佣金: {p.commission_split}</p>
            )}
          </div>
        )}

        {/* Contact button */}
        <div className="pt-2">
          <ContactForm
            propertyId={p.id}
            propertyTitle={p.title}
          />
        </div>
      </div>
    </div>
  );
}
