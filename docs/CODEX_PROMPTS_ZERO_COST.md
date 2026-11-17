# Zero-cost Oracle path for ChessTrace

This repository did not contain the external Claude file of this name. These steps provide the corresponding Oracle path using the current provider documentation. No Oracle resources were provisioned during M9.

## 2. Provision an Always Free VM

In your OCI **home region**, select an Always Free Ubuntu LTS Ampere A1 instance if capacity is available. Oracle currently describes the A1 allocation as “2 OCPUs and 12 GB of memory” across the tenancy, and lists “200 GB of Always Free block volume storage.” Both are shared with your other instances. Check your console's plan and usage before creating anything. If no capacity is available, wait or use an existing machine. Oracle can reclaim idle instances under its published criteria. [Oracle Always Free compute and storage](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

## 3. Install PostgreSQL and load a staging corpus

Use [Scale ChessTrace](SCALE_UP.md#1-provision-a-staging-target) to install PostgreSQL and pgvector. Restore into the separate target, confirm its size after the restore, and load the approved archives in stages with the scale profile. Keep database access on loopback or a private network. Backups need a copy outside the VM so reclamation cannot remove the only copy.

## 4. Connect the API and rehearse rollback

Run Express on the same VM if PostgreSQL is bound to loopback, and publish only an HTTPS API endpoint using hosting and a domain you already control. Keep the Vercel frontend and its stable origin. Follow the [cutover and rollback checklist](SCALE_UP.md#3-rehearse-cut-over-and-roll-back) before moving production users. If you cannot run the stage within the account's free allocation, stop and document the limiting resource.
