export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <h2 className="text-4xl font-extrabold tracking-tight text-gold-400">
          Game Master
        </h2>
        <p className="mt-2 text-sm text-gray-500">AI-Powered Tabletop RPG</p>
      </div>
      {children}
    </div>
  );
}
