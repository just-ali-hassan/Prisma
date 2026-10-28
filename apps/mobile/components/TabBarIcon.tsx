import { StyleSheet } from 'react-native';
import { LucideIcon } from 'lucide-react-native';

interface TabBarIconProps {
  Icon: LucideIcon;
  focused: boolean;
  color: string;
  size: number;
}

export function TabBarIcon({ Icon, focused, color, size }: TabBarIconProps) {
  return <Icon size={size} color={color} strokeWidth={focused ? 2.5 : 2} />;
}
