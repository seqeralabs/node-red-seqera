---
title: Overview
---

# Node-RED + Seqera: Examples

To jump-start your development, take a look at the examples that come with the extension:

-   Menu (top right `≡` button)
-   _Import_
-   _Examples_ (modal's left sidebar)
-   _Flows_ > _@seqera/node-red-seqera_ dropdown
-   Choose an example and import into your current workflow

![Importing examples](../img/import_examples.png)

## Available Examples

1. [**Simple launch & monitor**](01-simple-launch-monitor.md) - The most basic workflow demonstrating core Launch and Monitor nodes
2. [**Launch on file upload**](02-launch-on-file-upload.md) - Automatically launch pipelines when files are detected using Data Link polling
3. [**Studio on run fail + Slack webhook**](03-studio-slack-webhook.md) - Create a debugging Studio and send Slack notifications on workflow failure
4. [**RNA-seq → Differential Abundance**](04-rnaseq-differential-abundance.md) - Chain nf-core/rnaseq and nf-core/differentialabundance pipelines together
5. [**Auto-resume on workflow failure**](05-auto-resume-on-failure.md) - Automatically resume failed workflows to recover from transient errors
