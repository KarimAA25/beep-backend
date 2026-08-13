import { StyleSheet, Text, TouchableOpacity } from 'react-native';

type Variant = 'primary' | 'success' | 'danger' | 'secondary';

const VARIANT_STYLES: Record<Variant, { bg: string; text: string }> = {
  primary: { bg: '#2563EB', text: '#FFFFFF' },
  success: { bg: '#16A34A', text: '#FFFFFF' },
  danger: { bg: '#DC2626', text: '#FFFFFF' },
  secondary: { bg: '#E2E8F0', text: '#0F172A' },
};

interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
}

export function AppButton({ title, onPress, variant = 'primary', disabled }: AppButtonProps) {
  const { bg, text } = VARIANT_STYLES[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[styles.button, { backgroundColor: bg }, disabled && styles.disabled]}
    >
      <Text style={[styles.label, { color: text }]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
});
