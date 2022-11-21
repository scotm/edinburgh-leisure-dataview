import type { NextPage } from "next";
import Head from "next/head";
import { TimetableDataTable } from "../components/TimetableDataTable";
import { trpc } from "../utils/trpc";

const Home: NextPage = () => {
  const { data, isLoading } = trpc.example.alltimes.useQuery();
  if (isLoading || data === undefined) {
    return null;
  }
  return (
    <>
      <Head>
        <title>Edinburgh Leisure Data View</title>
        <meta name="description" content="Generated by create-t3-app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="container mx-auto flex min-h-screen flex-col items-center justify-center p-4">
        <TimetableDataTable data={data} />
      </main>
    </>
  );
};

export default Home;
