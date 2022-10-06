use crate::{
    nats::{JetStreamable, NoReply, SubscribeSubject, TypedMessage},
    types::ClusterName,
};
use serde::{Deserialize, Serialize};
use std::{fmt::Display, time::Duration};

/// Number of seconds “early” that a message with a TTL should be
/// re-sent, to account for network delay and variance.
const TTL_BUFFER_SECONDS: u64 = 10;

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq, Hash, Clone, Copy)]
pub enum DnsRecordType {
    A,
    TXT,
}

impl Display for DnsRecordType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct SetDnsRecord {
    pub cluster: ClusterName,
    pub kind: DnsRecordType,
    pub name: String,
    pub value: String,
}

impl TypedMessage for SetDnsRecord {
    type Response = NoReply;

    fn subject(&self) -> String {
        format!(
            "cluster.{}.dns.{}",
            self.cluster.subject_name(),
            serde_json::to_string(&self.kind).unwrap()
        )
    }
}

impl JetStreamable for SetDnsRecord {
    fn config() -> async_nats::jetstream::stream::Config {
        async_nats::jetstream::stream::Config {
            name: Self::stream_name().into(),
            subjects: vec!["cluster.*.dns.*".into()],
            max_age: Duration::from_secs(Self::ttl_seconds()),
            ..async_nats::jetstream::stream::Config::default()
        }
    }

    fn stream_name() -> &'static str {
        "dns_record"
    }
}

impl SetDnsRecord {
    pub fn subscribe_subject() -> SubscribeSubject<Self> {
        SubscribeSubject::new("cluster.*.dns.*".into())
    }

    fn ttl_seconds() -> u64 {
        60
    }

    pub fn ttl() -> Duration {
        Duration::from_secs(Self::ttl_seconds())
    }

    pub fn send_period() -> u64 {
        Self::ttl_seconds() - TTL_BUFFER_SECONDS
    }
}