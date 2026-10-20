import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { FileError, waitForImage } from "../models/files.server";
import type { ImageResult } from "../models/image-result";

// GET ?id=…: the address and size of a picture the merchant chose with Shopify's file
// picker (components/setting-control.tsx). App Bridge adds the session token.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^gid:\/\/shopify\/MediaImage\/\d+$/.test(id))
    return answer({ error: "Choose a picture." }, 400);

  try {
    return answer({ image: await waitForImage(admin, id) });
  } catch (error) {
    if (error instanceof FileError)
      return answer({ error: error.message }, 422);
    // An expired or invalid token: App Bridge retries with a fresh one.
    if (error instanceof Response && error.status === 401) throw error;
    console.error("Picture from Shopify Files:", error);
    if (isAccessDenied(error)) {
      return answer(
        {
          error:
            "Appsy doesn't have access to your Shopify Files yet. Close the editor, reload Appsy and approve the update if Shopify asks, then try again.",
        },
        403,
      );
    }
    return answer(
      { error: "Shopify didn't give Appsy the picture. Please try again." },
      502,
    );
  }
};

// Shopify refused a call for want of a permission: a GraphQL ACCESS_DENIED error, or HTTP 403.
function isAccessDenied(error: unknown) {
  if (error instanceof Response) return error.status === 403;
  const graphQLErrors = (
    error as {
      body?: {
        errors?: { graphQLErrors?: { extensions?: { code?: string } }[] };
      };
    }
  )?.body?.errors?.graphQLErrors;
  return (
    Array.isArray(graphQLErrors) &&
    graphQLErrors.some(
      (graphQLError) => graphQLError.extensions?.code === "ACCESS_DENIED",
    )
  );
}

function answer(result: ImageResult, status = 200) {
  return Response.json(result, { status });
}
