interface ContentPageProps {
  readonly heading: string;
  readonly body: string;
}

export function ContentPage({ heading, body }: ContentPageProps) {
  const paragraphs = body.split('\n').filter((line) => line.trim().length > 0);

  return (
    <main className="mx-auto max-w-[720px] px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold">{heading}</h1>
      <div className="mt-6 flex flex-col gap-4">
        {paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-base">
            {paragraph}
          </p>
        ))}
      </div>
    </main>
  );
}
