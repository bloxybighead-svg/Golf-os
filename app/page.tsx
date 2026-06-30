import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col gap-6 pt-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Golf OS</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Your personal practice and performance tracker.
        </p>
      </div>
      <Link
        href="/log"
        className="inline-flex w-fit items-center gap-2 rounded-md bg-[#4ade80] px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
      >
        Open Practice Log →
      </Link>
    </div>
  );
}
