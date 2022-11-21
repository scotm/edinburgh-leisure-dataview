import {
  Column,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedUniqueValues,
  getFilteredRowModel,
  Table,
  useReactTable,
} from "@tanstack/react-table";
import React from "react";
import { AppRouterTypes } from "../utils/trpc";

import { UnwrapArray } from "../utils/typescript";

type Props = {
  data: AppRouterTypes["example"]["alltimes"]["output"];
};

function Filter({
  column,
  table,
}: {
  column: Column<any, unknown>;
  table: Table<any>;
}) {
  const firstValue = table
    .getPreFilteredRowModel()
    .flatRows[0]?.getValue(column.id);

  const columnFilterValue = column.getFilterValue();
  const facetedUniqueValues = column.getFacetedUniqueValues();

  const sortedUniqueValues = React.useMemo(
    () =>
      typeof firstValue === "number"
        ? []
        : Array.from(facetedUniqueValues.keys()).sort(),
    [facetedUniqueValues, firstValue]
  );
  if (typeof firstValue === "number") {
    const minmax = column.getFacetedMinMaxValues();
    return (
      <div>
        <div className="flex space-x-2">
          <DebouncedInput
            type="number"
            min={Number(minmax?.[0] ?? "")}
            max={Number(minmax?.[1] ?? "")}
            value={(columnFilterValue as [number, number])?.[0] ?? ""}
            onChange={(value) =>
              column.setFilterValue((old: [number, number]) => [
                value,
                old?.[1],
              ])
            }
            placeholder={`Min ${minmax?.[0] ? `(${minmax?.[0]})` : ""}`}
            className="w-16 rounded border shadow"
          />
          <DebouncedInput
            type="number"
            min={Number(minmax?.[0] ?? "")}
            max={Number(minmax?.[1] ?? "")}
            value={(columnFilterValue as [number, number])?.[1] ?? ""}
            onChange={(value) =>
              column.setFilterValue((old: [number, number]) => [
                old?.[0],
                value,
              ])
            }
            placeholder={`Max ${minmax?.[1] ? `(${minmax?.[1]})` : ""}`}
            className="w-16 rounded border shadow"
          />
        </div>
        <div className="h-1" />
      </div>
    );
  } else {
    return (
      <>
        <datalist id={column.id + "list"}>
          {sortedUniqueValues.slice(0, 5000).map((value: any) => (
            <option value={value} key={value} />
          ))}
        </datalist>
        <DebouncedInput
          type="text"
          value={(columnFilterValue ?? "") as string}
          onChange={(value) => column.setFilterValue(value)}
          placeholder={`Search... (${facetedUniqueValues.size})`}
          className="w-36 rounded border shadow"
          list={column.id + "list"}
        />
        <div className="h-1" />
      </>
    );
  }
}

// A debounced input react component
function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 500,
  ...props
}: {
  value: string | number;
  onChange: (value: string | number) => void;
  debounce?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange">) {
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      onChange(value);
    }, debounce);

    return () => clearTimeout(timeout);
  }, [value, debounce, onChange]);

  return (
    <input
      {...props}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

export const TimetableDataTable: React.FC<Props> = ({ data }) => {
  const columnHelper = createColumnHelper<UnwrapArray<Props["data"]>>();
  const columns = [
    columnHelper.accessor("name", {
      header: () => <span>Name</span>,
      filterFn: "includesString",
    }),
    columnHelper.accessor("site.name", {
      header: () => <span>Where</span>,
      filterFn: "includesString",
    }),
    columnHelper.accessor("site.facility_name", {
      header: () => <span>Facilty</span>,
      filterFn: "includesString",
    }),
    columnHelper.accessor("date", {
      cell: (info) => info.getValue(),
      header: () => <span>Date</span>,
    }),
    columnHelper.accessor("time", {
      cell: (info) => info.getValue(),
      header: () => <span>Time</span>,
      enableColumnFilter: false,
    }),
    columnHelper.accessor("end_time", {
      cell: (info) => info.getValue(),
      header: () => <span>Time</span>,
      enableColumnFilter: false,
    }),
    // columnHelper.accessor("description", {
    //   cell: (info) => info.getValue(),
    //   header: () => <span>Description</span>,
    //   enableColumnFilter: false,
    // }),
    columnHelper.accessor("level", {
      header: () => <span>Level</span>,
    }),
  ];
  const table = useReactTable({
    data,
    columns,

    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
  });

  return (
    <table className="table-auto">
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr
            className="border-b p-4 pl-8 pt-0 pb-3 text-left font-medium"
            key={headerGroup.id}
          >
            {headerGroup.headers.map((header) => (
              <th
                className="border-b p-4 pl-8 pt-0 pb-3 text-left"
                key={header.id}
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                {header.column.getCanFilter() ? (
                  <div>
                    <Filter column={header.column} table={table} />
                  </div>
                ) : null}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr className="border-b p-4 pl-8 pt-0 pb-3 text-left" key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td className="border-b p-4 pl-8" key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      <tfoot>
        {table.getFooterGroups().map((footerGroup) => (
          <tr key={footerGroup.id}>
            {footerGroup.headers.map((header) => (
              <th key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.footer,
                      header.getContext()
                    )}
              </th>
            ))}
          </tr>
        ))}
      </tfoot>
    </table>
  );
};
