import React from "react";
import { AppRouterTypes } from "../utils/trpc";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { UnwrapArray } from "../utils/typescript";

type Props = {
  data: AppRouterTypes["example"]["alltimes"]["output"];
};

export const TimetableDataTable: React.FC<Props> = ({ data }) => {
  const columnHelper = createColumnHelper<UnwrapArray<Props["data"]>>();
  const columns = [
    columnHelper.accessor("name", {
      header: () => <span>Name</span>,
    }),
    columnHelper.accessor("site.name", {
      header: () => <span>Where</span>,
    }),
    columnHelper.accessor("date_time", {
      cell: (info) => info.getValue().toDateString(),
      header: () => <span>Muscles</span>,
    }),
    columnHelper.accessor("description", {
      cell: (info) => info.getValue(),
      header: () => <span>Description</span>,
    }),
    columnHelper.accessor("level", {
      header: () => <span>Level</span>,
    }),
  ];
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
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
