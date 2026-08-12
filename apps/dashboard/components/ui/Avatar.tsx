/**
 * Person avatar: photo when there is one, quiet initials otherwise. Sized by
 * the caller; deterministic background tint from the name so lists don't read
 * as a wall of identical grey circles (docs/design-system.md).
 */

const TINTS = [
  "bg-[#e8effc] text-[#3565c0]",
  "bg-[#e9f4ee] text-[#2f7350]",
  "bg-[#faf1dc] text-[#8a6216]",
  "bg-[#f6e9f2] text-[#98447e]",
  "bg-[#eceafb] text-[#5a4fb8]",
  "bg-[#fbeae8] text-[#a2453c]",
];

export function Avatar({
  name,
  photoUrl,
  size = 40,
  className = "",
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const tint = TINTS[Math.abs([...name].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % TINTS.length];
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) };

  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" style={style} className={`shrink-0 rounded-full object-cover ${className}`} />;
  }
  return (
    <span
      style={style}
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${tint} ${className}`}
    >
      {initials || "?"}
    </span>
  );
}
