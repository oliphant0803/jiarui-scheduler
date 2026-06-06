import Image from "next/image";

/**
 * Brand lockup shown at the top of every auth/dashboard card: the logo centered
 * above the bleu-blanc-rouge rule.
 */
export function BrandHeader() {
  return (
    <div className="brand-header">
      <Image
        src="/logo.png"
        alt="Jiarui French"
        width={80}
        height={80}
        className="brand-logo"
        priority
        unoptimized
      />
      <div className="tricolore" />
    </div>
  );
}
