import { NativeSelectOption } from "design-system/components/ui/native-select";
export const selectOptions = (
  items: { id: string; name: string }[],
  value: string,
) => (
  <>
    {!items.some((i) => i.id === value) && (
      <NativeSelectOption value={value}>已失效：{value}</NativeSelectOption>
    )}
    {items.map((i) => (
      <NativeSelectOption key={i.id} value={i.id}>
        {i.name}
      </NativeSelectOption>
    ))}
  </>
);
