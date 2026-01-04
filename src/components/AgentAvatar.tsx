interface AgentAvatarProps {
  avatarUrl?: string | null;
  name: string;
  size?: number;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(word => word.length > 0);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    return words[0][0].toUpperCase();
  }
  // First letter of first name + first letter of last name
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function AgentAvatar({ avatarUrl, name, size = 32 }: AgentAvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover flex-shrink-0"
      />
    );
  }
  
  const initials = getInitials(name);
  const fontSize = Math.max(size * 0.4, 12);
  
  return (
    <div
      style={{ width: size, height: size, fontSize }}
      className="rounded-full bg-[#2a2a2a] text-white flex items-center justify-center flex-shrink-0 font-medium"
    >
      {initials}
    </div>
  );
}
