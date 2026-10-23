# One-off generator for shared/ontology.json — kept for maintainability; edit the table below, re-run.
import json, sys
rows = """
# canonical | display | category | aliases (;) | flags (cs=case-sensitive, strict=no -/'/& adjacency) | implies (;)
python|Python|languages|py;python3||
java|Java|languages|core java;java se;java ee;j2ee||
javascript|JavaScript|languages|js;ecmascript;es6;vanilla js||
typescript|TypeScript|languages||cs-alias:TS|javascript
c|C|languages||cs;strict|
c++|C++|languages|cpp||
c#|C#|languages|csharp;c sharp||
go|Go|languages|golang|cs;strict|
rust|Rust|languages||cs|
ruby|Ruby|languages||cs|
php|PHP|languages|||
kotlin|Kotlin|languages|||
swift|Swift|languages||cs|
scala|Scala|languages||cs|
r|R|languages||cs;strict|
perl|Perl|languages|||
bash|Bash|languages|shell scripting;bash scripting||
powershell|PowerShell|languages|||
sql|SQL|languages|||
html|HTML|languages|html5||
css|CSS|languages|css3||
groovy|Groovy|languages|||
dart|Dart|languages||cs|
objective-c|Objective-C|languages|objective c;objc||
matlab|MATLAB|languages|||
vba|VBA|languages|||
pytest|Pytest|testing|py.test||python
unittest|unittest|testing|||python
robot framework|Robot Framework|testing|robotframework||python
behave|Behave|testing||cs|python
selenium|Selenium|testing|selenium webdriver;webdriver;selenium grid||
playwright|Playwright|testing|||
cypress|Cypress|testing||cs|
puppeteer|Puppeteer|testing|||
webdriverio|WebdriverIO|testing|wdio||
appium|Appium|testing|||
espresso|Espresso|testing||cs|
xcuitest|XCUITest|testing|xcui test||
junit|JUnit|testing|junit5;junit 5||java
testng|TestNG|testing|||java
mockito|Mockito|testing|||java
rest assured|REST Assured|testing|rest-assured;restassured||java
cucumber|Cucumber|testing||cs|
specflow|SpecFlow|testing|||
bdd|BDD|methods|behavior driven development;behaviour driven development;behavior-driven development;behaviour-driven development||
tdd|TDD|methods|test driven development;test-driven development||
gherkin|Gherkin|testing|||
jest|Jest|testing||cs|javascript
mocha|Mocha|testing||cs|javascript
chai|Chai|testing||cs|javascript
jasmine|Jasmine|testing||cs|
karma|Karma|testing||cs|
vitest|Vitest|testing|||
postman|Postman|testing|newman||
soapui|SoapUI|testing|soap ui;readyapi||
jmeter|JMeter|testing|apache jmeter||
gatling|Gatling|testing|||
locust|Locust|testing||cs|python
k6|k6|testing|||
loadrunner|LoadRunner|testing|load runner||
testrail|TestRail|tools|||
zephyr|Zephyr|tools||cs|
xray|Xray|tools||cs|
qtest|qTest|tools|||
browserstack|BrowserStack|testing|browser stack||
sauce labs|Sauce Labs|testing|saucelabs||
lambdatest|LambdaTest|testing|||
allure|Allure|testing|allure report;allure reports||
extent reports|Extent Reports|testing|extentreports||
api testing|API testing|testing|api test automation||
test automation|Test Automation|testing|automation testing;automated testing;test automation framework;automation framework||
manual testing|Manual Testing|testing|||
performance testing|Performance Testing|testing|load testing;stress testing||
regression testing|Regression Testing|testing|regression suite;regression suites||
unit testing|Unit Testing|testing|unit tests||
integration testing|Integration Testing|testing|integration tests||
end-to-end testing|End-to-End Testing|testing|e2e testing;e2e tests;end to end testing;end-to-end tests||
contract testing|Contract Testing|testing|pact||
mobile testing|Mobile Testing|testing|mobile automation||
security testing|Security Testing|security|penetration testing;pen testing||
accessibility testing|Accessibility Testing|testing|a11y testing||
react|React|frameworks|react.js;reactjs|cs|javascript
react native|React Native|mobile|||
angular|Angular|frameworks|angularjs;angular.js|cs|
vue|Vue.js|frameworks|vue.js;vuejs;vue 3|cs|javascript
svelte|Svelte|frameworks|||
next.js|Next.js|frameworks|nextjs||react
node.js|Node.js|frameworks|nodejs;node js||javascript
express|Express.js|frameworks|express.js;expressjs|cs|node.js
nestjs|NestJS|frameworks|nest.js||node.js
django|Django|frameworks|||python
flask|Flask|frameworks||cs|python
fastapi|FastAPI|frameworks|fast api||python
spring boot|Spring Boot|frameworks|springboot||java
spring framework|Spring Framework|frameworks|spring mvc||java
hibernate|Hibernate|frameworks|||java
.net|.NET|frameworks|dotnet;.net core;.net framework||
asp.net|ASP.NET|frameworks|asp.net core;asp.net mvc||.net
ruby on rails|Ruby on Rails|frameworks|rails;ror|cs|ruby
laravel|Laravel|frameworks|||php
graphql|GraphQL|frameworks|||
rest api|REST APIs|frameworks|restful;restful api;restful apis;rest apis;rest api;rest services;restful services|cs-alias:REST|
soap|SOAP|frameworks|||
grpc|gRPC|frameworks|||
microservices|Microservices|frameworks|microservice;microservices architecture||
kafka|Apache Kafka|data|apache kafka||
rabbitmq|RabbitMQ|data|rabbit mq||
redux|Redux|frameworks|||react
tailwind css|Tailwind CSS|frameworks|tailwind;tailwindcss||css
bootstrap|Bootstrap|frameworks||cs|css
jquery|jQuery|frameworks|||javascript
flutter|Flutter|mobile|||dart
android|Android|mobile|android sdk||
ios|iOS|mobile|||
swiftui|SwiftUI|mobile|||swift
aws|AWS|cloud|amazon web services||
azure|Microsoft Azure|cloud|microsoft azure;ms azure||
gcp|Google Cloud|cloud|google cloud platform;google cloud||
ec2|Amazon EC2|cloud|amazon ec2;aws ec2||aws
s3|Amazon S3|cloud|amazon s3;aws s3||aws
aws lambda|AWS Lambda|cloud|lambda functions||aws
cloudformation|CloudFormation|cloud|aws cloudformation||aws
ecs|Amazon ECS|cloud|amazon ecs;aws ecs||aws;docker
eks|Amazon EKS|cloud|amazon eks;aws eks||aws;kubernetes
aks|Azure Kubernetes Service|cloud|azure kubernetes service||azure;kubernetes
gke|Google Kubernetes Engine|cloud|google kubernetes engine||gcp;kubernetes
azure devops|Azure DevOps|devops|azure pipelines;vsts|cs-alias:ADO|azure;ci/cd
azure functions|Azure Functions|cloud|||azure
dynamodb|DynamoDB|databases|amazon dynamodb;dynamo db||aws
cloudflare workers|Cloudflare Workers|cloud|||
firebase|Firebase|cloud|||
heroku|Heroku|cloud|||
vercel|Vercel|cloud|||
docker|Docker|devops|docker compose;docker-compose;dockerfile||
kubernetes|Kubernetes|devops|k8s||
helm|Helm|devops||cs|kubernetes
openshift|OpenShift|devops|||kubernetes
terraform|Terraform|devops|||
ansible|Ansible|devops|||
puppet|Puppet|devops||cs|
chef|Chef|devops||cs|
jenkins|Jenkins|devops|jenkins pipelines;jenkinsfile||ci/cd
github actions|GitHub Actions|devops|gh actions;github workflows||ci/cd
gitlab ci|GitLab CI|devops|gitlab ci/cd;gitlab-ci;gitlab pipelines||ci/cd
circleci|CircleCI|devops|circle ci||ci/cd
travis ci|Travis CI|devops|travisci||ci/cd
bamboo|Bamboo|devops||cs|ci/cd
teamcity|TeamCity|devops|||ci/cd
argo cd|Argo CD|devops|argocd||kubernetes
ci/cd|CI/CD|devops|ci cd;cicd;ci-cd;continuous integration;continuous delivery;continuous deployment;ci/cd pipelines;ci/cd pipeline||
git|Git|tools|||
github|GitHub|tools|||git
gitlab|GitLab|tools|||git
bitbucket|Bitbucket|tools|||git
jira|Jira|tools|atlassian jira||
confluence|Confluence|tools|||
linux|Linux|devops|ubuntu;centos;rhel;red hat linux||
nginx|Nginx|devops|||
apache|Apache HTTP Server|devops|apache httpd|cs|
prometheus|Prometheus|devops|||
grafana|Grafana|devops|||
datadog|Datadog|devops|data dog||
splunk|Splunk|devops|||
elk|ELK Stack|devops|elk stack;elastic stack||
kibana|Kibana|devops|||
logstash|Logstash|devops|||
new relic|New Relic|devops|newrelic||
sentry|Sentry|devops||cs|
observability|Observability|devops|monitoring and observability||
sre|Site Reliability Engineering|devops|site reliability engineering||
devops|DevOps|methods|dev ops||
mysql|MySQL|databases|||sql
postgresql|PostgreSQL|databases|postgres;postgre sql||sql
sql server|SQL Server|databases|mssql;ms sql;microsoft sql server;t-sql;tsql||sql
oracle database|Oracle Database|databases|oracle db;pl/sql;plsql||sql
sqlite|SQLite|databases|||sql
mongodb|MongoDB|databases|mongo||
redis|Redis|databases|||
cassandra|Cassandra|databases|apache cassandra||
elasticsearch|Elasticsearch|databases|elastic search||
snowflake|Snowflake|data||cs|
bigquery|BigQuery|data|google bigquery||gcp
redshift|Amazon Redshift|data|aws redshift||aws
databricks|Databricks|data|||
spark|Apache Spark|data|apache spark;pyspark|cs|
hadoop|Hadoop|data|apache hadoop;hdfs||
airflow|Apache Airflow|data|apache airflow||
dbt|dbt|data|||
etl|ETL|data|elt;etl pipelines||
pandas|pandas|data|||python
numpy|NumPy|data|||python
tableau|Tableau|data|||
power bi|Power BI|data|powerbi||
excel|Microsoft Excel|tools|ms excel;microsoft excel|cs|
machine learning|Machine Learning|ai|ml||
deep learning|Deep Learning|ai|||
tensorflow|TensorFlow|ai|||
pytorch|PyTorch|ai|||python
scikit-learn|scikit-learn|ai|sklearn;scikit learn||python
nlp|NLP|ai|natural language processing||
llm|LLMs|ai|llms;large language models;large language model||
generative ai|Generative AI|ai|genai;gen ai||
langchain|LangChain|ai|||
openai api|OpenAI API|ai|||
computer vision|Computer Vision|ai|opencv||
oauth|OAuth|security|oauth2;oauth 2.0||
jwt|JWT|security|json web tokens;json web token||
owasp|OWASP|security|owasp top 10||
sso|SSO|security|single sign-on;single sign on;saml||
agile|Agile|methods|agile methodology;agile methodologies||
scrum|Scrum|methods|scrum master||agile
kanban|Kanban|methods|||
safe|SAFe|methods|scaled agile framework|cs|agile
waterfall|Waterfall|methods||cs|
sdlc|SDLC|methods|software development life cycle;software development lifecycle||
stlc|STLC|methods|software testing life cycle||
shift-left testing|Shift-Left Testing|methods|shift left;shift-left||
istqb|ISTQB|methods|||
json|JSON|tools|||
xml|XML|tools|||
yaml|YAML|tools|yml||
figma|Figma|tools|||
swagger|Swagger|tools|openapi;open api||
charles proxy|Charles Proxy|tools|||
wireshark|Wireshark|tools|||
visual studio code|VS Code|tools|vscode;vs code||
intellij|IntelliJ IDEA|tools|intellij idea||
webpack|webpack|tools|||javascript
vite|Vite|tools||cs|javascript
npm|npm|tools|||node.js
maven|Maven|tools|apache maven||java
gradle|Gradle|tools|||
microsoft office|Microsoft Office|tools|ms office||
salesforce|Salesforce|tools|||
servicenow|ServiceNow|tools|service now||
"""
terms = []
for line in rows.strip().splitlines():
    if line.startswith('#') or not line.strip():
        continue
    parts = (line.split('|') + ['', '', '', '', '', ''])[:6]
    canonical, display, category, aliases, flags, implies = [p.strip() for p in parts]
    entry = {"canonical": canonical, "display": display, "category": category,
             "aliases": [a for a in aliases.split(';') if a]}
    fl = [f for f in flags.split(';') if f]
    if 'cs' in fl: entry["caseSensitive"] = True
    if 'strict' in fl: entry["strict"] = True
    cs_alias = [f.split(':', 1)[1] for f in fl if f.startswith('cs-alias:')]
    if cs_alias: entry["caseSensitiveAliases"] = cs_alias
    imp = [i for i in implies.split(';') if i]
    if imp: entry["implies"] = imp
    terms.append(entry)
distinct = [["java","javascript"],["react","react native"],["c","c++"],["c","c#"],["c++","c#"],["sql server","mysql"],["aws","azure"],["aws","gcp"],["azure","gcp"],["selenium","playwright"],["selenium","cypress"],["playwright","cypress"],["postgresql","mysql"],["angular","react"],["vue","react"],["go","rust"],["junit","testng"],["jenkins","github actions"],["kubernetes","docker"],["swift","swiftui"],["scala","java"],["kotlin","java"],["typescript","java"],["ios","android"],["sql","mongodb"]]
json.dump({"version": 1, "terms": terms, "distinct": distinct}, open(sys.argv[1], 'w'), indent=1)
print(len(terms), "terms")
