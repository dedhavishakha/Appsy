import type {
  HeadersFunction,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { useLoaderData } from "react-router";
import { z } from "zod";
import {
  ACCOUNT_DELETION_KEEP_DAYS,
  accountClientId,
  ERASE_AFTER_DAYS,
} from "@appsy/app-config";
import db from "../db.server";
import { PublicArticle } from "../components/public-page";
import { storeContact } from "../models/accounts.server";
import { loadLiveSettings } from "../models/design.server";

// An app's public page for deleting an account, which Google Play asks apps with account
// creation to link in the Data safety form: it names the app, gives a way to ask without the
// app (the store's public contact email), and says what's deleted and kept
// (https://support.google.com/googleplay/android-developer/answer/13327111). The Publishing
// page gives merchants its address. It stays up while shopper accounts are off, for shoppers
// who made an account before.

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const id = z.uuid().safeParse(params.appId);
  if (!id.success) throw new Response("Not found", { status: 404 });
  const project = await db.appProject.findUnique({
    where: { id: id.data },
    select: {
      appName: true,
      shop: { select: { shopDomain: true, uninstalledAt: true } },
    },
  });
  if (!project || project.shop.uninstalledAt) {
    throw new Response("Not found", { status: 404 });
  }
  const [settings, contact] = await Promise.all([
    loadLiveSettings(id.data),
    storeContact(project.shop.shopDomain),
  ]);
  return {
    appName: settings?.app?.name ?? project.appName,
    store: contact?.name ?? project.appName,
    email: contact?.email ?? null,
    privacyPolicy: settings?.links.privacyPolicy ?? null,
    inApp: settings ? accountClientId(settings) !== null : false,
  };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data ? `Delete your ${data.appName} account` : "Delete your account",
  },
];

// Changes rarely; a short cache spares Shopify a request for each visit.
export const headers: HeadersFunction = () => ({
  "Cache-Control": "public, max-age=600",
});

export default function DeleteAccount() {
  const { appName, store, email, privacyPolicy, inApp } =
    useLoaderData<typeof loader>();
  const policy = privacyPolicy ? (
    <a href={privacyPolicy}>{store}&apos;s privacy policy</a>
  ) : (
    `${store}'s privacy policy`
  );

  return (
    <PublicArticle>
      <h1>Delete your {appName} account</h1>
      <p>
        {appName} is the shopping app of {store}. If you made an account in it,
        you can ask {store} to delete your account and the personal data that
        goes with it.
      </p>

      {inApp && (
        <>
          <h2>In the app</h2>
          <ol>
            <li>Open the Account tab and sign in.</li>
            <li>Choose Delete account, then Delete my account.</li>
          </ol>
        </>
      )}

      <h2>{inApp ? "Without the app" : "How to ask"}</h2>
      {email ? (
        <p>
          Email {store} at{" "}
          <a
            href={`mailto:${email}?subject=${encodeURIComponent("Delete my account")}`}
          >
            {email}
          </a>{" "}
          from the email address you sign in with, and ask them to delete your
          account.
        </p>
      ) : (
        <p>
          Contact {store} using the details in {policy}.
        </p>
      )}

      <h2>What&apos;s deleted and what&apos;s kept</h2>
      <p>
        Shopify erases your account and your personal details, such as your name
        and addresses, {ERASE_AFTER_DAYS} days after the request. Records of
        what you bought, and when, stay with {store}. Subscriptions end, and
        payments still due on pre-orders aren&apos;t taken.
      </p>
      <p>
        A request made in the app goes through Appsy, which runs the app for{" "}
        {store}. Appsy keeps your customer number with the request until Shopify
        has erased your account, and {ACCOUNT_DELETION_KEEP_DAYS} days at most.
      </p>
      <p>More about your data: {policy}.</p>
    </PublicArticle>
  );
}
