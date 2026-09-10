import { Controller, useFormContext } from 'react-hook-form';
import { View } from 'react-native';
import ColorPicker, {
  Preview,
  Panel1,
  HueSlider,
  OpacitySlider,
  Swatches,
  ColorFormatsObject,
} from 'reanimated-color-picker';
import Label from '@/components/base/label';
import { CategoryFormValues } from '../category-modal';

const categorySwatchColors = [
  '#0073FF', // Electric Blue
  '#00C2FF', // Cyan
  '#00D4A8', // Teal
  '#20C997', // Emerald
  '#A3E635', // Lime
  '#FACC15', // Yellow
  '#FF8A1F', // Orange
  '#EF4444', // Red
  '#FB7185', // Coral
  '#F472B6', // Pink
  '#A855F7', // Purple
  '#6366F1', // Indigo
];
export default function CategoryColorPickerField() {
  const { control } = useFormContext<CategoryFormValues>();

  return (
    <Controller
      control={control}
      name="color"
      render={({ field }) => (
        <>
          <Label>Color</Label>
          {/** Color picker **/}
          <ColorPicker
            onCompleteJS={({ hex }: ColorFormatsObject) => {
              field.onChange(hex);
            }}
            value={field.value}
          >
            <Preview
              style={{ marginBottom: 12, height: 30 }}
              hideInitialColor={true}
            />

            <View>
              <Panel1 style={{ height: 150 }} />
              <HueSlider
                style={{ marginTop: 12 }}
                sliderThickness={20}
                thumbSize={25}
              />
            </View>

            <View style={{ marginTop: 15, marginBottom: 15 }}>
              <OpacitySlider sliderThickness={20} thumbSize={25} />
            </View>

            <Swatches style={{ marginTop: 14 }} colors={categorySwatchColors} />
          </ColorPicker>
        </>
      )}
    />
  );
}
