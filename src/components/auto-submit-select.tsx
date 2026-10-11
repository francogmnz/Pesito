"use client";

/** Select que envía su formulario al cambiar (sin JS se usa el botón del <noscript>). */
export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
