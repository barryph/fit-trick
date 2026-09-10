import React from 'react';
import { View, type DimensionValue, type ViewStyle } from 'react-native';
import Skeleton from './skeleton';

interface TextSkeletonProps {
  lines?: number;
  lastLineWidth?: DimensionValue;
  lineHeight?: number;
  spacing?: number;
  style?: ViewStyle;
}

const SkeletonText: React.FC<TextSkeletonProps> = ({
  lines = 3,
  lastLineWidth = '60%',
  lineHeight = 16,
  spacing = 8,
  style,
}) => {
  return (
    <View style={style}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          width={index === lines - 1 ? lastLineWidth : '100%'}
          height={lineHeight}
          style={{ marginBottom: index < lines - 1 ? spacing : 0 }}
        />
      ))}
    </View>
  );
};

export default SkeletonText;
