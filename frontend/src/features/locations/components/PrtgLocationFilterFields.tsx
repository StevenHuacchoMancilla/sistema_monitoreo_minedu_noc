import { FormField, Select } from '../../../components/ui/FormControls'
import { usePrtgLocationCatalog } from '../hooks/usePrtgLocationCatalog'

type Props = {
  province: string
  district: string
  onProvinceChange: (value: string) => void
  onDistrictChange: (value: string) => void
  provinceLabel?: string
  districtLabel?: string
  allProvincesLabel?: string
  allDistrictsLabel?: string
  disabled?: boolean
}

/**
 * Selects Provincia / Distrito desde catálogo PRTG persistido.
 * Al cambiar provincia limpia el distrito (vía onProvinceChange + onDistrictChange).
 */
export function PrtgLocationFilterFields({
  province,
  district,
  onProvinceChange,
  onDistrictChange,
  provinceLabel = 'Provincia',
  districtLabel = 'Distrito',
  allProvincesLabel = 'Todas',
  allDistrictsLabel = 'Todos',
  disabled = false,
}: Props) {
  const { provinces, districts, isLoading } = usePrtgLocationCatalog(province)

  return (
    <>
      <FormField label={provinceLabel}>
        <Select
          value={province}
          disabled={disabled || isLoading}
          onChange={(e) => {
            onProvinceChange(e.target.value)
            onDistrictChange('')
          }}
        >
          <option value="">{allProvincesLabel}</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={districtLabel}>
        <Select
          value={district}
          disabled={disabled || isLoading}
          onChange={(e) => onDistrictChange(e.target.value)}
        >
          <option value="">{allDistrictsLabel}</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </FormField>
    </>
  )
}
