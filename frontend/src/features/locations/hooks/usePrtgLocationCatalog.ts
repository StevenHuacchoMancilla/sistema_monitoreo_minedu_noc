import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { endpoints } from '../../../api/endpoints'

export type PrtgLocationTreeNode = {
  province: string
  districts: Array<{ name: string; assignment_count: number }>
  assignment_count: number
}

/**
 * Catálogo geográfico operativo PRTG (provincias/distritos completos).
 * Una sola query al árbol; distritos dependen de la provincia seleccionada.
 */
export function usePrtgLocationCatalog(selectedProvince = '') {
  const treeQuery = useQuery({
    queryKey: ['prtg', 'locations', 'tree'],
    queryFn: endpoints.prtgLocationTree,
    staleTime: 5 * 60_000,
  })

  const treeData = treeQuery.data?.data

  const provinces = useMemo(
    () => (treeData ?? []).map((node) => node.province),
    [treeData],
  )

  const districts = useMemo(() => {
    const tree = treeData ?? []
    if (!selectedProvince) {
      const names = new Set<string>()
      for (const node of tree) {
        for (const d of node.districts) names.add(d.name)
      }
      return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'))
    }

    const match = tree.find(
      (node) => node.province.toUpperCase() === selectedProvince.toUpperCase(),
    )
    return (match?.districts ?? []).map((d) => d.name)
  }, [treeData, selectedProvince])

  return {
    tree: treeData ?? [],
    provinces,
    districts,
    meta: treeQuery.data?.meta,
    isLoading: treeQuery.isLoading,
    isFetching: treeQuery.isFetching,
    isError: treeQuery.isError,
    error: treeQuery.error,
    refetch: treeQuery.refetch,
  }
}
