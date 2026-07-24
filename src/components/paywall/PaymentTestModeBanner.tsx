const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-center text-xs text-red-500">
        Live payments are not configured yet. Complete go-live in the Payments dashboard.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full border-b border-orange-500/40 bg-orange-500/10 px-4 py-2 text-center text-xs text-orange-500">
        Payments are in test mode — use card 4242 4242 4242 4242.
      </div>
    );
  }
  return null;
}