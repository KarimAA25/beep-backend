import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface StarRatingProps {
  value: number;
  onChange: (rating: number) => void;
}

const STARS = [1, 2, 3, 4, 5];

// UI-only (brief Phase 8) — no backend event, nothing persisted. Just local
// feedback for the prototype's rating flow.
export function StarRating({ value, onChange }: StarRatingProps) {
  return (
    <View style={styles.row}>
      {STARS.map((star) => (
        <TouchableOpacity key={star} onPress={() => onChange(star)} activeOpacity={0.7}>
          <Text style={[styles.star, star <= value && styles.starFilled]}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  star: {
    fontSize: 36,
    color: '#CBD5E1',
  },
  starFilled: {
    color: '#FBBF24',
  },
});
