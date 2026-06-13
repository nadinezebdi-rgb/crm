import React from "react";

export default function PageHeader({ title, subtitle, actions, testid }) {
  return (
    <header
      data-testid={testid || "page-header"}
      className="h-16 flex items-center justify-between px-8 border-b border-gray-200 bg-white sticky top-0 z-10"
    >
      <div>
        <h1
          className="text-xl font-bold tracking-tight text-slate-900 leading-none"
          style={{ fontFamily: "'Manrope', sans-serif" }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-3">{actions}</div>
    </header>
  );
}
