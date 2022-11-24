/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { StarIcon } from "@heroicons/react/24/solid";
import React from "react";
import { AppRouterTypes } from "../utils/trpc";
import { UnwrapArray } from "../utils/typescript";
import { ModalProps } from "./Modal";

function NumberFilter({
  column,
  columnFilterValue,
}: {
  column: Column<any, unknown>;
  columnFilterValue: unknown;
}) {
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
            column.setFilterValue((old: [number, number]) => [value, old?.[1]])
          }
          placeholder={`${minmax?.[0] ? `(${minmax?.[0]})` : ""}`}
          className="w-16 rounded border shadow"
        />
        <DebouncedInput
          type="number"
          min={Number(minmax?.[0] ?? "")}
          max={Number(minmax?.[1] ?? "")}
          value={(columnFilterValue as [number, number])?.[1] ?? ""}
          onChange={(value) =>
            column.setFilterValue((old: [number, number]) => [old?.[0], value])
          }
          placeholder={`${minmax?.[1] ? `(${minmax?.[1]})` : ""}`}
          className="w-16 rounded border shadow"
        />
      </div>
      <div className="h-1" />
    </div>
  );
}

function CustomColumnFilter({
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

  const sortedUniqueValues = React.useMemo(() => {
    if (typeof firstValue === "number") {
      return []
    } else if (typeof firstValue === "string") {
      return Array.from(facetedUniqueValues.keys()).sort();
    }
    return typeof firstValue === "number"
      ? []
      : Array.from(facetedUniqueValues.keys()).sort();
  }, [facetedUniqueValues]);
  if (typeof firstValue === "number") {
    return (
      <NumberFilter column={column} columnFilterValue={columnFilterValue} />
    );
  } else {
    return (
      <>
        <datalist id={column.id + "list"}>
          {sortedUniqueValues.slice(0, 5000).map((value: any) => (
            <option value={value} key={value}>{facetedUniqueValues.get(value)}</option>
          ))}
        </datalist>
        <DebouncedInput
          type="text"
          value={(columnFilterValue ?? "") as string}
          onChange={(value) => column.setFilterValue(value)}
          placeholder={`Search (${facetedUniqueValues.size})`}
          className="w-full rounded border shadow"
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
  debounce = 250,
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
  }, [value]);

  return (
    <input
      {...props}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

type TableDataProps = {
  data: AppRouterTypes["example"]["simplerTimes"]["output"];
  setShowModal: (showModal: boolean) => void;
  setModalData: (setModalData: Omit<ModalProps, "setShowModal">) => void;
};

export const TimetableDataTable: React.FC<TableDataProps> = ({
  data,
  setModalData,
  setShowModal,
}) => {
  const columnHelper =
    createColumnHelper<UnwrapArray<TableDataProps["data"]>>();

  const tableColumns = [
    columnHelper.accessor("event_name", {
      header: () => <span>Event</span>,
      filterFn: "includesString",
      // enableColumnFilter: false,
      cell: (props) => (
        <button
          className="mr-1 mb-1 w-full rounded bg-indigo-500 px-6 py-3 text-sm font-bold uppercase text-white shadow outline-none transition-all duration-150 ease-linear hover:shadow-lg focus:outline-none active:bg-pink-600"
          type="button"
          onClick={() => {
            setShowModal(true);
            setModalData({
              body: props.row.original.description,
              title: props.row.original.event_name,
            });
          }}
        >
          {props.row.original.event_name}
        </button>
      ),
    }),
    columnHelper.accessor("site_name", {
      header: () => <span>Where</span>,
    }),
    columnHelper.accessor("site_facility", {
      header: () => <span>Facilty</span>,
    }),
    columnHelper.accessor("date", {
      cell: (info) => info.getValue(),
      header: () => <span>Date</span>,
    }),
    columnHelper.accessor("time", {
      cell: (info) => info.getValue(),
      header: () => <span>Start</span>,
      enableColumnFilter: false,
    }),
    columnHelper.accessor("end_time", {
      cell: (info) => info.getValue(),
      header: () => <span>Finish</span>,
      enableColumnFilter: false,
    }),
    columnHelper.accessor("level", {
      header: () => <span>Intensity</span>,
      cell: (info) => {
        const level = info.getValue();
        switch (level) {
          case 1:
            return (
              <span className="text-green-500">
                <StarIcon className="inline h-4 w-4" />
              </span>
            );
          case 2:
            return (
              <span className="text-yellow-500">
                <StarIcon className="inline h-4 w-4" />
                <StarIcon className="inline h-4 w-4" />
              </span>
            );
          case 3:
            return (
              <span className="text-red-500">
                <StarIcon className="inline h-4 w-4" />
                <StarIcon className="inline h-4 w-4" />
                <StarIcon className="inline h-4 w-4" />
              </span>
            );
          default:
        }
      },
    }),
  ];

  const table = useReactTable({
    data,
    columns: tableColumns,

    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
  });

  return (
    <>
      <h3 className="my-2 text-2xl">
        Number of rows: {table.getPrePaginationRowModel().rows.length}
      </h3>
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
                      <CustomColumnFilter
                        column={header.column}
                        table={table}
                      />
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
    </>
  );
};
