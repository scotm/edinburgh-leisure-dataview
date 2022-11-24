import { FC } from "react";

export type ModalProps = {
  setShowModal: (showModal: boolean) => void;
  title: string;
  body: JSX.Element | string;
};

export const Modal: FC<ModalProps> = ({ setShowModal, body, title }) => {
  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden outline-none focus:outline-none"
        onClick={() => setShowModal(false)}
      >
        <div
          className="relative my-6 mx-auto w-auto max-w-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex w-full flex-col rounded-lg border-0 bg-white shadow-lg outline-none focus:outline-none">
            <div className="flex items-start justify-between rounded-t border-b border-solid border-slate-200 p-5">
              <h3 className="text-3xl font-semibold">{title}</h3>
              <button
                className="float-right ml-auto border-0 bg-transparent p-1 text-3xl font-semibold leading-none text-black opacity-5 outline-none focus:outline-none"
                onClick={() => {
                  setShowModal(false);
                }}
              >
                <span className="block h-6 w-6 bg-transparent text-2xl text-black outline-none focus:outline-none">
                  ×
                </span>
              </button>
            </div>
            <div className="relative flex-auto p-6">
              <p className="my-4 text-lg leading-relaxed text-slate-500">
                {body}
              </p>
            </div>
            {/*footer*/}
            <div className="flex items-center justify-end rounded-b border-t border-solid border-slate-200 p-6">
              <button
                className="mr-1 mb-1 bg-red-500 px-6 py-2 text-sm font-bold uppercase text-white outline-none transition-all duration-150 ease-linear focus:outline-none"
                type="button"
                onClick={() => {
                  setShowModal(false);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="fixed inset-0 z-40 bg-black opacity-25"></div>
    </>
  );
};
