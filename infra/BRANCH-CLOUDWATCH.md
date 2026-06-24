Branch: feat/cloudwatch-logs

Purpose: Add CloudWatch Log Groups, saved CloudWatch Logs Insights queries, and a basic dashboard for the service so logs are centralized, searchable, and usable for alerts.

Changes in this branch:
- Create `/ecs/<service>` log group with 30-day retention.
- Add saved Insights queries for error rate, slow requests, and contract submission failures.
- Add a starter CloudWatch dashboard (widgets can be expanded later).

Next steps / how to test:
1. Review `infra/logs_and_alarms.tf` for names and retention settings.
2. terraform plan/apply with `-var="service_name=your-service"` and verify log groups in AWS.
3. Deploy an ECS task with `awslogs` enabled and confirm logs appear in the created log group.
4. Open CloudWatch Logs Insights and run the saved queries to validate results.
Branch: feat/cloudwatch-logs

Purpose: Add CloudWatch Log Groups, saved CloudWatch Logs Insights queries, and a basic dashboard for the service so logs are centralized, searchable, and usable for alerts.

Changes in this branch:
- Create `/ecs/<service>` log group with 30-day retention.
- Add saved Insights queries for error rate, slow requests, and contract submission failures.
- Add a starter CloudWatch dashboard (widgets can be expanded later).

Next steps / how to test:
1. Review `infra/logs_and_alarms.tf` for names and retention settings.
2. terraform plan/apply with `-var="service_name=your-service"` and verify log groups in AWS.
3. Deploy an ECS task with `awslogs` enabled and confirm logs appear in the created log group.
4. Open CloudWatch Logs Insights and run the saved queries to validate results.
