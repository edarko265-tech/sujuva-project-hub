import Image from 'next/image';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Image
        src="/logo.png"
        alt="Sujuva"
        width={size * 3}
        height={size}
        priority
        style={{ width: 'auto', height: size }}
      />
      <span className="hidden sm:inline text-sm font-semibold text-brand-navy">Project Hub</span>
    </div>
  );
}
