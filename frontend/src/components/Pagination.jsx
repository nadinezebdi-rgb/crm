import React from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

export const PAGE_SIZES = [20, 50, 100];

export default function Pagination({ total, page, setPage, pageSize, setPageSize, testid = "pagination" }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 bg-slate-50/60 text-xs text-slate-600" data-testid={testid}>
      <div className="flex items-center gap-2">
        <span>Afficher</span>
        <select
          className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          data-testid={`${testid}-size`}
        >
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span>par page</span>
      </div>
      <div className="flex items-center gap-3">
        <span data-testid={`${testid}-info`}>{from}–{to} sur {total}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="h-7 w-7 rounded-md border border-slate-200 bg-white flex items-center justify-center disabled:opacity-40 hover:bg-slate-100 transition-colors"
            data-testid={`${testid}-prev`}
          >
            <CaretLeft size={13} />
          </button>
          <span className="px-2 font-medium text-slate-800">{page} / {pages}</span>
          <button
            onClick={() => setPage(Math.min(pages, page + 1))}
            disabled={page >= pages}
            className="h-7 w-7 rounded-md border border-slate-200 bg-white flex items-center justify-center disabled:opacity-40 hover:bg-slate-100 transition-colors"
            data-testid={`${testid}-next`}
          >
            <CaretRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
