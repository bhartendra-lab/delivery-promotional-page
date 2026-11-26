/**
 * Old address of the campaign tracking link. The link is now on the website
 * (https://vyavasth.in/w/<id>); this only forwards a message that still carries
 * the dashboard address. Delete it once no template does.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return Response.redirect(`https://vyavasth.in/w/${encodeURIComponent(token)}`, 302);
}
